import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GROUPS, SUBJECT_TOTALS, SUBJECT_CODE_MAP } from '@/lib/subjects';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  ArrowLeft, 
  Calendar, 
  BookOpen, 
  TrendingUp,
  User,
  Trash2
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate } from 'react-router-dom';

interface AttendanceRecord {
  id: string;
  subject: string;
  date: string;
}

interface Profile {
  name: string;
  user_id: string;
}



const Profile = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<string>(() => {
    try {
      return localStorage.getItem('student_group') || 'TY CE-1';
    } catch (e) {
      return 'TY CE-1';
    }
  });
  useEffect(() => {
    try { localStorage.setItem('student_group', group); } catch (e) {}
  }, [group]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  // Realtime subscription to attendance changes for the current user
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('public:attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `student_id=eq.${user.id}` }, payload => {
        console.log('Realtime payload:', payload);
        // On insert or delete, refetch latest data
        fetchData();
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.warn('Error removing supabase channel', e);
      }
    };
  }, [user]);


  const fetchData = async () => {
    if (!user) return;
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('name, user_id')
        .eq('user_id', user.id)
        .single();
      if (profileError) throw profileError;
      setProfile(profileData);

      // Fetch attendance records
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('id, subject, date')
        .eq('student_id', user.id)
        .order('date', { ascending: false });
      if (attendanceError) throw attendanceError;
  console.log('Fetched attendance:', attendanceData);
  setAttendanceRecords(attendanceData || []);
  // extra debug
  console.log('Setting attendanceRecords with', (attendanceData || []).length, 'items');
    } catch (error: any) {
      console.error('Fetch error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getAttendanceStats = () => {
    const stats: { [key: string]: number } = {};
    attendanceRecords.forEach(record => {
      const raw = (record.subject || '').toString().trim().toUpperCase();
      const key = SUBJECT_CODE_MAP[raw] || record.subject;
      stats[key] = (stats[key] || 0) + 1;
    });
    return stats;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };


  const handleDeleteAttendance = async () => {
    if (!selectedRecord) return;
    console.log('Attempting to delete:', { selectedRecord, userId: user?.id });
    try {
      const { error, data } = await supabase
        .from('attendance')
        .delete()
        .eq('id', selectedRecord.id)
        .eq('student_id', user?.id); // Extra security check
      console.log('Delete result:', { error, data });
      if (error) throw error;
      setAttendanceRecords(prev => prev.filter(record => record.id !== selectedRecord.id));
      toast({
        title: "Success",
        description: "Attendance record deleted successfully",
      });
      // Ensure authoritative refresh from DB so summary percentages stay consistent
      try {
        await fetchData();
        console.log('Refetched attendance after delete');
      } catch (e) {
        console.warn('Error refetching after delete', e);
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete attendance record",
        variant: "destructive",
      });
    } finally {
      setSelectedRecord(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!user) return;
    try {
      // Delete all attendance rows for this user
      const { error, data } = await supabase
        .from('attendance')
        .delete()
        .eq('student_id', user.id);
      if (error) throw error;

      // Clear local state so UI updates immediately
      setAttendanceRecords([]);
      toast({
        title: 'All records deleted',
        description: 'All your attendance records were deleted successfully.',
      });

      // Fetch authoritative data from DB to ensure consistency
      try {
        await fetchData();
      } catch (e) {
        console.warn('Error refetching after delete all', e);
      }
    } catch (error: any) {
      console.error('Delete all error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete all attendance records',
        variant: 'destructive',
      });
    }
  };


  // Always calculate stats from the latest attendanceRecords
  const attendanceStats = (() => {
    const stats: { [key: string]: number } = {};
    attendanceRecords.forEach(record => {
      const key = SUBJECT_CODE_MAP[record.subject] || record.subject;
      stats[key] = (stats[key] || 0) + 1;
    });
    return stats;
  })();

  // Calculate percentage for each subject
  const attendancePercentages = Object.entries(attendanceStats).reduce((acc, [subject, attended]) => {
    const total = SUBJECT_TOTALS[group]?.[subject] || 0;
    acc[subject] = total > 0 ? Math.round((attended / total) * 100) : null;
    return acc;
  }, {} as Record<string, number | null>);

  // Debug logging when records or group change
  useEffect(() => {
    console.log('attendanceRecords changed:', attendanceRecords);
    console.log('attendanceStats computed:', attendanceStats);
    console.log('attendancePercentages computed for group', group, attendancePercentages);
  }, [attendanceRecords, group]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Navigation Bar */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-border/50 sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Button>
          
          <div className="flex items-center space-x-2">
            <User className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Profile</h1>
          </div>
        </div>
      </nav>

  <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl">
        {/* Profile Info Card */}
        <Card className="mb-8 bg-white/80 backdrop-blur-sm border-0">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-6 w-6" />
              <span>Student Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="text-lg font-semibold">{profile?.name || 'Student'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="text-lg font-semibold">{user?.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance Statistics & Group Selection */}
        <Card className="mb-8 bg-white/80 backdrop-blur-sm border-0">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-6 w-6" />
              <span>Attendance Summary</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <span className="font-medium">Select Your Group:</span>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger className="w-full md:w-[160px]">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map(g => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(SUBJECT_TOTALS[group]).map(([subject, total]) => {
                const rawAttended = attendanceStats[subject] || 0;
                const attended = Math.min(rawAttended, total);
                const percent = total > 0 ? Math.round((attended / total) * 100) : 0;
                return (
                  <div key={subject} className="text-center p-4 bg-muted/50 rounded-lg">
                    <BookOpen className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="font-semibold">{subject}</p>
                    <p className="text-2xl font-bold text-primary">{attended} / {total}</p>
                    {total > 0 ? (
                      <p className="text-lg font-semibold text-green-700">{percent}%</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No lectures scheduled</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Attendance History Table */}
        <Card className="bg-white/80 backdrop-blur-sm border-0">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-6 w-6" />
                <span>Attendance History</span>
                <div className="ml-4">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteAllDialogOpen(true)}
                    disabled={attendanceRecords.length === 0}
                  >
                    Delete All
                  </Button>
                </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceRecords.length > 0 ? (
                <>
                  {/* Desktop / tablet table */}
                  <div className="rounded-lg border overflow-x-auto hidden md:block">
                    <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {formatDate(record.date)}
                        </TableCell>
                        <TableCell>{SUBJECT_CODE_MAP[(record.subject || '').toString().trim().toUpperCase()] || record.subject}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedRecord(record);
                              setDeleteDialogOpen(true);
                            }}
                            className="text-destructive hover:text-destructive/90"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>

                {/* Mobile stacked list */}
                <div className="md:hidden space-y-3">
                  {attendanceRecords.map((record) => (
                    <div key={record.id} className="p-4 bg-white/80 backdrop-blur-sm rounded-lg border flex items-center justify-between">
                      <div>
                        <div className="text-sm text-muted-foreground">{formatDate(record.date)}</div>
                        <div className="font-medium">{SUBJECT_CODE_MAP[(record.subject || '').toString().trim().toUpperCase()] || record.subject}</div>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedRecord(record);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive hover:text-destructive/90"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Attendance Record</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this attendance record? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setSelectedRecord(null)}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteAttendance} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Delete All Confirmation Dialog */}
                <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete All Attendance Records</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all your attendance records across the site and cannot be undone. Are you sure you want to proceed?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setDeleteAllDialogOpen(false)}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={async () => {
                        // call handler inline to keep dialog close behavior consistent
                        setDeleteAllDialogOpen(false);
                        await handleDeleteAll();
                      }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No attendance records found</p>
                <p className="text-sm text-muted-foreground">
                  Go to the dashboard to start marking your attendance
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;