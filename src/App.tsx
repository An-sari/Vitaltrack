/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, Component } from 'react';
import { 
  Plus, 
  History, 
  TrendingDown, 
  Target, 
  Scale, 
  User as UserIcon,
  LogOut,
  ChevronRight,
  Activity,
  Calendar,
  Weight,
  Dumbbell,
  Trophy,
  BarChart3,
  Flame,
  Clock,
  Zap
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { format, subDays, isSameDay, startOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  Timestamp,
  getDocFromServer,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';

// Types
interface UserProfile {
  height: number;
  targetWeight: number;
  unit: 'metric' | 'imperial';
  displayName?: string;
  photoURL?: string;
}

interface WeightLog {
  id: string;
  weight: number;
  date: Date;
  note?: string;
}

interface ExerciseLog {
  id: string;
  activity: string;
  duration: number;
  intensity: 'Low' | 'Moderate' | 'High';
  date: Date;
}

interface Milestone {
  id: string;
  title: string;
  date: Date;
  type: 'weight' | 'time' | 'custom';
}

// Helper: Calculate BMI
const calculateBMI = (weightKg: number, heightCm: number) => {
  if (!heightCm) return '0';
  const heightM = heightCm / 100;
  return (weightKg / (heightM * heightM)).toFixed(1);
};

const getBMICategory = (bmi: number) => {
  if (bmi < 18.5) return { label: 'Underweight', color: 'text-blue-500', bg: 'bg-blue-500/10' };
  if (bmi < 25) return { label: 'Healthy', color: 'text-green-500', bg: 'bg-green-500/10' };
  if (bmi < 30) return { label: 'Overweight', color: 'text-orange-500', bg: 'bg-orange-500/10' };
  return { label: 'Obese', color: 'text-red-500', bg: 'bg-red-500/10' };
};

// Exercise Suggestions
const getExerciseSuggestions = (currentBMI: number, targetWeight: number, currentWeight: number) => {
  const weightDiff = currentWeight - targetWeight;
  if (weightDiff > 20 || currentBMI > 30) {
    return [
      { title: 'Brisk Walking', duration: '30-45 min', intensity: 'Low-Moderate', icon: '🚶' },
      { title: 'Swimming', duration: '30 min', intensity: 'Moderate', icon: '🏊' },
      { title: 'Yoga', duration: '40 min', intensity: 'Low', icon: '🧘' }
    ];
  } else if (weightDiff > 5) {
    return [
      { title: 'Jogging', duration: '30 min', intensity: 'Moderate', icon: '🏃' },
      { title: 'Cycling', duration: '45 min', intensity: 'Moderate', icon: '🚴' },
      { title: 'Bodyweight Circuit', duration: '20 min', intensity: 'High', icon: '💪' }
    ];
  } else {
    return [
      { title: 'HIIT Workout', duration: '20 min', intensity: 'High', icon: '🔥' },
      { title: 'Strength Training', duration: '45 min', intensity: 'High', icon: '🏋️' },
      { title: 'Running', duration: '40 min', intensity: 'High', icon: '🏃‍♂️' }
    ];
  }
};

// Components
const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-3xl p-6 shadow-sm border border-gray-100 ${className}`}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = "",
  disabled = false,
  type = 'button'
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost',
  className?: string,
  disabled?: boolean,
  type?: 'button' | 'submit' | 'reset'
}) => {
  const variants = {
    primary: 'bg-black text-white hover:bg-gray-800',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    outline: 'border border-gray-200 text-gray-900 hover:bg-gray-50',
    ghost: 'text-gray-600 hover:bg-gray-100'
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      type={type}
      className={`px-6 py-3 rounded-2xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <Activity className="text-red-500 w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <p className="text-gray-500 mb-8 max-w-xs mx-auto">
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()}>Refresh App</Button>
          {process.env.NODE_ENV !== 'production' && (
            <pre className="mt-8 p-4 bg-gray-100 rounded-xl text-xs text-left overflow-auto max-w-full">
              {JSON.stringify(this.state.error, null, 2)}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'exercise'>('dashboard');

  // Form states
  const [newWeight, setNewWeight] = useState('');
  const [newActivity, setNewActivity] = useState('Cardio');
  const [newDuration, setNewDuration] = useState('30');
  const [newIntensity, setNewIntensity] = useState<'Low' | 'Moderate' | 'High'>('Moderate');
  const [setupHeight, setSetupHeight] = useState('');
  const [setupTarget, setSetupTarget] = useState('');

  // Auth & Initial Data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Test connection as per guidelines
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (e) {}

        // Fetch profile
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          setProfile(profileSnap.data() as UserProfile);
        } else {
          setShowSetup(true);
        }

        // Listen to weight logs
        const logsQuery = query(
          collection(db, 'users', firebaseUser.uid, 'weightLogs'),
          orderBy('date', 'desc')
        );

        const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
          const fetchedLogs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            date: (doc.data().date as Timestamp).toDate()
          })) as WeightLog[];
          setLogs(fetchedLogs);
          
          // Check for milestones
          if (profileSnap.exists()) {
            checkMilestones(fetchedLogs, profileSnap.data() as UserProfile, firebaseUser.uid);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}/weightLogs`);
        });

        // Listen to exercise logs
        const exerciseQuery = query(
          collection(db, 'users', firebaseUser.uid, 'exerciseLogs'),
          orderBy('date', 'desc'),
          limit(20)
        );

        const unsubscribeExercise = onSnapshot(exerciseQuery, (snapshot) => {
          const fetched = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            date: (doc.data().date as Timestamp).toDate()
          })) as ExerciseLog[];
          setExerciseLogs(fetched);
        });

        // Listen to milestones
        const milestoneQuery = query(
          collection(db, 'users', firebaseUser.uid, 'milestones'),
          orderBy('date', 'desc')
        );

        const unsubscribeMilestones = onSnapshot(milestoneQuery, (snapshot) => {
          const fetched = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            date: (doc.data().date as Timestamp).toDate()
          })) as Milestone[];
          setMilestones(fetched);
        });

        setLoading(false);
        return () => {
          unsubscribeLogs();
          unsubscribeExercise();
          unsubscribeMilestones();
        };
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const checkMilestones = async (currentLogs: WeightLog[], currentProfile: UserProfile, uid: string) => {
    if (!currentLogs.length || !currentProfile) return;
    
    const initial = currentLogs[currentLogs.length - 1].weight;
    const current = currentLogs[0].weight;
    const lost = initial - current;

    const milestonesRef = collection(db, 'users', uid, 'milestones');
    
    // Check 5kg milestone
    if (lost >= 5) {
      const snap = await getDoc(doc(milestonesRef, 'lost_5kg'));
      if (!snap.exists()) {
        await setDoc(doc(milestonesRef, 'lost_5kg'), {
          title: 'Lost 5kg! Amazing progress.',
          date: Timestamp.now(),
          type: 'weight'
        });
      }
    }

    // Check target weight
    if (current <= currentProfile.targetWeight) {
      const snap = await getDoc(doc(milestonesRef, 'reached_target'));
      if (!snap.exists()) {
        await setDoc(doc(milestonesRef, 'reached_target'), {
          title: 'Goal Reached! You are incredible.',
          date: Timestamp.now(),
          type: 'weight'
        });
      }
    }
  };

  const [fitConnected, setFitConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Check Google Fit connection status
  useEffect(() => {
    const checkFitStatus = async () => {
      try {
        const response = await fetch('/api/fit/status');
        const data = await response.json();
        setFitConnected(data.connected);
      } catch (error) {
        console.error("Fit status check failed:", error);
      }
    };
    if (user) checkFitStatus();
  }, [user]);

  // Listen for Google Fit auth success
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;
      
      if (event.data?.type === 'GOOGLE_FIT_AUTH_SUCCESS') {
        setFitConnected(true);
        handleSyncFit();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectFit = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      window.open(url, 'google_fit_auth', 'width=600,height=700');
    } catch (error) {
      console.error("Failed to get auth URL:", error);
    }
  };

  const handleSyncFit = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const response = await fetch('/api/fit/sync', { method: 'POST' });
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);

      // Process weight data
      const weightBuckets = data.weightData.bucket || [];
      for (const bucket of weightBuckets) {
        const weightVal = bucket.dataset[0]?.point[0]?.value[0]?.fpVal;
        if (weightVal) {
          const date = new Date(parseInt(bucket.startTimeMillis));
          const path = `users/${user?.uid}/weightLogs`;
          await addDoc(collection(db, path), {
            weight: parseFloat(weightVal.toFixed(1)),
            date: Timestamp.fromDate(date),
            note: 'Synced from Google Fit'
          });
        }
      }

      // Process activity data
      const activityBuckets = data.activityData.bucket || [];
      for (const bucket of activityBuckets) {
        const points = bucket.dataset[0]?.point || [];
        for (const point of points) {
          const duration = (parseInt(point.endTimeNanos) - parseInt(point.startTimeNanos)) / 1000000 / 60000; // minutes
          if (duration > 5) {
            const path = `users/${user?.uid}/exerciseLogs`;
            await addDoc(collection(db, path), {
              activity: 'Google Fit Activity',
              duration: Math.round(duration),
              intensity: 'Moderate',
              date: Timestamp.fromDate(new Date(parseInt(point.startTimeNanos) / 1000000))
            });
          }
        }
      }
      
      alert("Google Fit data synced successfully!");
    } catch (error) {
      console.error("Fit sync failed:", error);
      alert("Failed to sync from Google Fit. Please try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const newProfile: UserProfile = {
      height: parseFloat(setupHeight),
      targetWeight: parseFloat(setupTarget),
      unit: 'metric',
      displayName: user.displayName || '',
      photoURL: user.photoURL || ''
    };

    try {
      await setDoc(doc(db, 'users', user.uid), newProfile);
      setProfile(newProfile);
      setShowSetup(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newWeight) return;

    const path = `users/${user.uid}/weightLogs`;
    try {
      await addDoc(collection(db, path), {
        weight: parseFloat(newWeight),
        date: Timestamp.now(),
        note: ''
      });
      setNewWeight('');
      setShowAddModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleAddExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newActivity) return;

    const path = `users/${user.uid}/exerciseLogs`;
    try {
      await addDoc(collection(db, path), {
        activity: newActivity,
        duration: parseFloat(newDuration),
        intensity: newIntensity,
        date: Timestamp.now()
      });
      setNewActivity('Cardio');
      setNewDuration('30');
      setShowExerciseModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  // Derived Data
  const currentWeight = logs[0]?.weight || 0;
  const initialWeight = logs[logs.length - 1]?.weight || 0;
  const weightLost = initialWeight ? (initialWeight - currentWeight).toFixed(1) : 0;
  const bmi = profile ? calculateBMI(currentWeight, profile.height) : '0';
  const bmiInfo = getBMICategory(parseFloat(bmi));
  
  const chartData = useMemo(() => {
    return [...logs].reverse().map(log => ({
      date: format(log.date, 'MMM d'),
      weight: log.weight,
      bmi: profile ? parseFloat(calculateBMI(log.weight, profile.height)) : 0
    }));
  }, [logs, profile]);

  const exerciseSuggestions = useMemo(() => {
    if (!profile) return [];
    return getExerciseSuggestions(parseFloat(bmi), profile.targetWeight, currentWeight);
  }, [bmi, profile, currentWeight]);

  const progressPercent = profile ? Math.min(100, Math.max(0, 
    ((initialWeight - currentWeight) / (initialWeight - profile.targetWeight)) * 100
  )) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-black border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="w-20 h-20 bg-black rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl">
            <Activity className="text-white w-10 h-10" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">VitalTrack</h1>
          <p className="text-gray-500 mb-12 text-lg">
            Your personal companion for a healthier, lighter life. Track your progress with precision.
          </p>
          <Button onClick={handleLogin} className="w-full py-4 text-lg">
            Get Started with Google
          </Button>
        </motion.div>
      </div>
    );
  }

  if (showSetup) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <h2 className="text-2xl font-bold mb-2">Welcome to VitalTrack</h2>
          <p className="text-gray-500 mb-8">Let's set up your profile to start tracking.</p>
          
          <form onSubmit={handleSetup} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Height (cm)</label>
              <input 
                type="number" 
                required
                value={setupHeight}
                onChange={(e) => setSetupHeight(e.target.value)}
                placeholder="e.g. 175"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-black focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Weight (kg)</label>
              <input 
                type="number" 
                required
                value={setupTarget}
                onChange={(e) => setSetupTarget(e.target.value)}
                placeholder="e.g. 75"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-black focus:border-transparent outline-none"
              />
            </div>
            <Button type="submit" className="w-full">Complete Setup</Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-32">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
              <Activity className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">VitalTrack</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
            <img 
              src={user.photoURL || ''} 
              alt="Profile" 
              className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Quick Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Scale className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Current</span>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">{currentWeight || '--'} <span className="text-sm font-normal text-gray-400">kg</span></div>
                    <div className="text-xs text-gray-400 mt-1">Last logged {logs[0] ? format(logs[0].date, 'MMM d') : 'never'}</div>
                  </div>
                </Card>

                <Card className="flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-green-50 rounded-lg">
                      <TrendingDown className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">Lost</span>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">{weightLost} <span className="text-sm font-normal text-gray-400">kg</span></div>
                    <div className="text-xs text-gray-400 mt-1">Since your first log</div>
                  </div>
                </Card>
              </div>

              {/* BMI Card */}
              <Card className="bg-black text-white overflow-hidden relative">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold opacity-80">Body Mass Index</h3>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${bmiInfo.bg} ${bmiInfo.color}`}>
                      {bmiInfo.label}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold tracking-tighter">{bmi}</span>
                    <span className="text-white/40">BMI Score</span>
                  </div>
                </div>
                <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
              </Card>

              {/* Goal Progress */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-gray-400" />
                    <h3 className="font-bold">Goal Progress</h3>
                  </div>
                  <span className="text-sm font-medium text-gray-500">Target: {profile?.targetWeight} kg</span>
                </div>
                <div className="w-full bg-gray-100 h-4 rounded-full overflow-hidden mb-2">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    className="h-full bg-black rounded-full"
                  />
                </div>
                <div className="flex justify-between text-xs font-medium text-gray-400">
                  <span>{progressPercent.toFixed(0)}% Complete</span>
                  <span>{Math.max(0, currentWeight - (profile?.targetWeight || 0)).toFixed(1)} kg to go</span>
                </div>
              </Card>

              {/* Google Fit Integration */}
              <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                      <Activity className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-blue-900">Google Fit</h3>
                  </div>
                  {fitConnected ? (
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded-full uppercase tracking-wider">Connected</span>
                  ) : (
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full uppercase tracking-wider">Not Linked</span>
                  )}
                </div>
                <p className="text-sm text-blue-800/70 mb-4">
                  {fitConnected 
                    ? "Your weight and activities are automatically synced from Google Fit."
                    : "Connect to Google Fit to automatically sync your weight and workout data."}
                </p>
                <div className="flex gap-3">
                  {fitConnected ? (
                    <>
                      <Button 
                        onClick={handleSyncFit} 
                        disabled={isSyncing}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {isSyncing ? "Syncing..." : "Sync Now"}
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={async () => {
                          await fetch('/api/fit/disconnect', { method: 'POST' });
                          setFitConnected(false);
                        }}
                        className="text-blue-600 hover:bg-blue-100"
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button 
                      onClick={handleConnectFit}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Connect Google Fit
                    </Button>
                  )}
                </div>
              </Card>

              {/* Milestones */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  <h3 className="font-bold text-gray-900">Milestones</h3>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {milestones.length > 0 ? milestones.map(m => (
                    <motion.div 
                      key={m.id}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex-shrink-0 bg-white border border-gray-100 p-4 rounded-2xl shadow-sm min-w-[200px]"
                    >
                      <div className="w-8 h-8 bg-yellow-50 rounded-lg flex items-center justify-center mb-3">
                        <Zap className="w-4 h-4 text-yellow-500" />
                      </div>
                      <div className="font-bold text-sm mb-1">{m.title}</div>
                      <div className="text-xs text-gray-400">{format(m.date, 'MMM d, yyyy')}</div>
                    </motion.div>
                  )) : (
                    <div className="text-sm text-gray-400 italic">No milestones achieved yet. Keep going!</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div 
              key="analytics"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <Card className="h-80">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-gray-900">Weight Trend</h3>
                </div>
                <div className="h-full w-full -ml-4">
                  <ResponsiveContainer width="100%" height="80%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#000" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#000" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                      <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="weight" stroke="#000" strokeWidth={3} fillOpacity={1} fill="url(#colorWeight)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="h-80">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-gray-900">BMI Progress</h3>
                </div>
                <div className="h-full w-full -ml-4">
                  <ResponsiveContainer width="100%" height="80%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                      <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line type="monotone" dataKey="bmi" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, fill: '#3B82F6' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'exercise' && (
            <motion.div 
              key="exercise"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Suggestions */}
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900">Recommended for You</h3>
                <div className="grid grid-cols-1 gap-3">
                  {exerciseSuggestions.map((s, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">{s.icon}</div>
                        <div>
                          <div className="font-bold text-sm">{s.title}</div>
                          <div className="text-xs text-gray-400">{s.duration} • {s.intensity} intensity</div>
                        </div>
                      </div>
                      <Button variant="ghost" className="p-2 h-auto" onClick={() => {
                        setNewActivity(s.title);
                        setShowExerciseModal(true);
                      }}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* History */}
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900">Exercise History</h3>
                <div className="space-y-3">
                  {exerciseLogs.length > 0 ? exerciseLogs.map(log => (
                    <div key={log.id} className="bg-white p-4 rounded-2xl border border-gray-50 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                          <Flame className="w-5 h-5 text-orange-500" />
                        </div>
                        <div>
                          <div className="font-bold text-sm">{log.activity}</div>
                          <div className="text-xs text-gray-400">{log.duration} min • {format(log.date, 'MMM d')}</div>
                        </div>
                      </div>
                      <div className={`text-xs font-bold px-2 py-1 rounded-full ${
                        log.intensity === 'High' ? 'bg-red-50 text-red-500' :
                        log.intensity === 'Moderate' ? 'bg-orange-50 text-orange-500' :
                        'bg-blue-50 text-blue-500'
                      }`}>
                        {log.intensity}
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-8 text-gray-400 text-sm">No exercises logged yet.</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-4 z-20">
        <div className="max-w-2xl mx-auto flex items-center justify-around">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'dashboard' ? 'text-black' : 'text-gray-400'}`}
          >
            <Activity className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
          </button>
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'analytics' ? 'text-black' : 'text-gray-400'}`}
          >
            <BarChart3 className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Stats</span>
          </button>
          <div className="relative -top-8">
            <button 
              onClick={() => setShowAddModal(true)}
              className="w-14 h-14 bg-black text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95"
            >
              <Plus className="w-7 h-7" />
            </button>
          </div>
          <button 
            onClick={() => setActiveTab('exercise')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'exercise' ? 'text-black' : 'text-gray-400'}`}
          >
            <Dumbbell className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Workout</span>
          </button>
          <button 
            onClick={() => setShowExerciseModal(true)}
            className="flex flex-col items-center gap-1 text-gray-400 hover:text-black transition-colors"
          >
            <Flame className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Log</span>
          </button>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddModal(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] p-8 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6">Log Weight</h2>
              <form onSubmit={handleAddWeight} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Weight (kg)</label>
                  <div className="relative">
                    <input type="number" step="0.1" required autoFocus value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder="0.0" className="w-full px-6 py-4 rounded-2xl border border-gray-200 text-3xl font-bold focus:ring-2 focus:ring-black outline-none" />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-medium">kg</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>Cancel</Button>
                  <Button type="submit" className="flex-1">Save Log</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showExerciseModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowExerciseModal(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] p-8 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6">Log Exercise</h2>
              <form onSubmit={handleAddExercise} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Activity</label>
                    <input type="text" required value={newActivity} onChange={(e) => setNewActivity(e.target.value)} placeholder="e.g. Running, Yoga" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-black outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Duration (min)</label>
                      <input type="number" required value={newDuration} onChange={(e) => setNewDuration(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-black outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Intensity</label>
                      <select value={newIntensity} onChange={(e) => setNewIntensity(e.target.value as any)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-black outline-none bg-white">
                        <option value="Low">Low</option>
                        <option value="Moderate">Moderate</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowExerciseModal(false)}>Cancel</Button>
                  <Button type="submit" className="flex-1">Save Workout</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
