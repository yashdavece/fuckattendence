import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  BookOpen, 
  Code, 
  Cpu, 
  Dumbbell, 
  Users, 
  Monitor,
  LogOut,
  User
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNavigate } from 'react-router-dom';
import { SUBJECT_CODE_MAP, SUBJECT_TOTALS } from '@/lib/subjects';

const subjects = [
  { name: 'CN', fullName: 'Computer Networks', icon: Monitor, color: 'bg-blue-500' },
  { name: 'ADA', fullName: 'Algorithm Design & Analysis', icon: Code, color: 'bg-green-500' },
  { name: 'SE', fullName: 'Software Engineering', icon: BookOpen, color: 'bg-purple-500' },
  { name: 'PE', fullName: 'Proffesional Ethics', icon: BookOpen, color: 'bg-orange-500' },
  { name: 'CPDP', fullName: 'Career & Personality Development', icon: Users, color: 'bg-pink-500' },
  { name: 'CS/PYTHON', fullName: 'Computer Science/Python (Elective)', icon: Cpu, color: 'bg-indigo-500' }
];

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Fetch current counts per subject for this user to determine disabled state
  const fetchCounts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('subject', { head: false })
        .eq('student_id', user.id);
      if (error) return;
      const map: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        const key = (row.subject || '').toString();
        map[key] = (map[key] || 0) + 1;
      });
      setCounts(map);
    } catch (e) {
      console.warn('fetchCounts error', e);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchCounts();
  }, [user]);

  // Realtime subscription: update counts when attendance changes for this user
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('public:attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `student_id=eq.${user.id}` }, payload => {
        console.log('Dashboard realtime payload:', payload);
        // refresh counts to keep subject cards in sync
        fetchCounts();
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

  const handleSubjectClick = (subjectName: string) => {
    // Set modal only after capacity check
    // Check current attended count for this subject for the current user
    if (!user) return;
    setLoading(true);
    const subjectKey = SUBJECT_CODE_MAP[subjectName] || subjectName;
    const group = (() => {
      try { return localStorage.getItem('student_group') || 'TY CE-1'; } catch (e) { return 'TY CE-1'; }
    })();
    const total = SUBJECT_TOTALS[group]?.[subjectKey] ?? 0;
    // Count existing attendance rows for this user & subject
    supabase
      .from('attendance')
      .select('id', { count: 'exact', head: false })
      .eq('student_id', user.id)
      .eq('subject', subjectName)
      .then(({ data, error, count }) => {
        setLoading(false);
        const attended = count || 0;
        if (total > 0 && attended >= total) {
          // already at max
          toast({
            title: 'Max Attendance',
            description: `${subjectName} has already reached maximum attendance (${attended}/${total}).`,
            variant: 'destructive'
          });
        } else {
          setSelectedSubject(subjectName);
          setIsModalOpen(true);
        }
      });
  };

  const handleAttendanceConfirm = async () => {
    if (!selectedSubject || !user) return;
    
    setLoading(true);
    
    try {
      // Double check current attendance count to avoid surpassing max
      const subjectKey = SUBJECT_CODE_MAP[selectedSubject] || selectedSubject;
      const group = (() => { try { return localStorage.getItem('student_group') || 'TY CE-1'; } catch (e) { return 'TY CE-1'; } })();
      const total = SUBJECT_TOTALS[group]?.[subjectKey] ?? 0;
      const countRes = await supabase.from('attendance').select('id', { count: 'exact', head: false })
        .eq('student_id', user.id)
        .eq('subject', selectedSubject);
      const current = countRes.count || 0;
      if (total > 0 && current >= total) {
        toast({ title: 'Max reached', description: `Cannot mark ${selectedSubject}, already ${current}/${total}.`, variant: 'destructive' });
        setLoading(false);
        setIsModalOpen(false);
        setSelectedSubject(null);
        return;
      }

      const { error } = await supabase
        .from('attendance')
        .insert({
          student_id: user.id,
          subject: selectedSubject,
          date: new Date().toISOString().split('T')[0] // YYYY-MM-DD format
        });

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          toast({
            title: "Already Marked",
            description: `You have already marked attendance for ${selectedSubject} today!`,
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Attendance Marked!",
          description: `Successfully marked attendance for ${selectedSubject}`,
        });
  // Optimistically update local counts so the subject card updates immediately
  setCounts(prev => ({ ...prev, [selectedSubject]: (prev[selectedSubject] || 0) + 1 }));
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to mark attendance",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setIsModalOpen(false);
      setSelectedSubject(null);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Navigation Bar */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-border/50 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Attendance Tracker</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => navigate('/profile')}
              className="flex items-center space-x-2"
            >
              <User className="h-4 w-4" />
              <span>Profile</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={handleLogout}
              className="flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">Welcome Back!</h2>
          <p className="text-muted-foreground">Click on a subject to mark your attendance</p>
        </div>

        {/* Subject Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {subjects.map((subject) => {
            const Icon = subject.icon;
            // compute subject-specific stats for display
            const subjectKey = SUBJECT_CODE_MAP[subject.name] || subject.name;
            const group = (() => { try { return localStorage.getItem('student_group') || 'TY CE-1'; } catch (e) { return 'TY CE-1'; } })();
            const total = SUBJECT_TOTALS[group]?.[subjectKey] ?? 0;
            const current = counts[subject.name] || 0;
            const attended = total > 0 ? Math.min(current, total) : current;
            const percent = total > 0 ? Math.round((attended / total) * 100) : 0;

            return (
              <Card 
                key={subject.name}
                className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg border-0 bg-white/80 backdrop-blur-sm"
                onClick={() => handleSubjectClick(subject.name)}
              >
                <CardHeader className="text-center pb-4">
                  <div className={`${subject.color} w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-xl font-bold">{subject.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-sm text-muted-foreground">{subject.fullName}</p>

                  {/* Attendance summary: attended / total and a small progress bar */}
                  <div className="mt-3">
                    <div className="text-sm text-muted-foreground">
                      {total > 0 ? `${attended}/${total} attended` : `${attended} attended`}
                    </div>
                    {total > 0 && (
                      <>
                        <div className="w-full h-2 bg-gray-200 rounded mt-2 overflow-hidden">
                          <div className="h-2 bg-primary rounded" style={{ width: `${percent}%` }} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{percent}%</div>
                      </>
                    )}
                  </div>

                  <Button 
                    className="mt-4 w-full group-hover:bg-primary/90 transition-colors" 
                    size="sm"
                    onClick={() => handleSubjectClick(subject.name)}
                    disabled={(() => {
                      const totalCheck = total;
                      const currentCheck = current;
                      return totalCheck > 0 && currentCheck >= totalCheck;
                    })()}
                  >
                    Mark Attendance
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Attendance Confirmation Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Attendance</DialogTitle>
            <DialogDescription>
              You attended the <strong>{selectedSubject}</strong> lecture. Mark attendance?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setIsModalOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAttendanceConfirm}
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                  <span>Marking...</span>
                </div>
              ) : (
                'Yes, Mark Attendance'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
