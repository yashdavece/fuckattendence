import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type StudentTotals = Record<string, number>;

export function useStudentTotals(userId?: string) {
  const [totals, setTotals] = useState<StudentTotals>({});
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('student_subject_totals')
        .select('subject, total')
        .eq('student_id', userId);
      if (error) throw error;
      const map: StudentTotals = {};
      (data || []).forEach((row: any) => {
        map[row.subject] = row.total;
      });
      setTotals(map);
    } catch (e) {
      console.warn('useStudentTotals fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const upsert = async (subject: string, groupName: string, total: number) => {
    if (!userId) throw new Error('No user id');
    const { error } = await supabase
      .from('student_subject_totals')
      .upsert({ student_id: userId, subject, group_name: groupName, total });
    if (error) throw error;
    setTotals(prev => ({ ...prev, [subject]: total }));
    return true;
  };

  return { totals, loading, fetch, upsert } as const;
}
