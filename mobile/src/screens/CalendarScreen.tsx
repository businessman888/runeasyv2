import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Platform,
    Image,
    Modal,
    Dimensions,
    Animated,
    PanResponder,
} from 'react-native';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useTrainingStore, useStatsStore } from '../stores';

// SVG Icons
function BackIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>←</Text>;
}

function BellIcon({ size = 24, color = '#EBEBF5' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M12 2C12.7697 1.99939 13.5343 2.12576 14.263 2.374C13.5725 3.08786 13.1375 4.01009 13.0259 4.99696C12.9143 5.98384 13.1323 6.97991 13.646 7.82993C14.1596 8.67996 14.9401 9.33618 15.8656 9.69633C16.7912 10.0565 17.8099 10.1003 18.763 9.821L19 9.743V12.527C19.0001 12.643 19.0204 12.758 19.06 12.867L19.106 12.974L20.822 16.407C20.9015 16.566 20.9413 16.7419 20.9379 16.9196C20.9346 17.0974 20.8882 17.2717 20.8028 17.4276C20.7174 17.5835 20.5955 17.7164 20.4475 17.8148C20.2994 17.9133 20.1298 17.9744 19.953 17.993L19.838 17.999H4.16197C3.98413 17.9991 3.80894 17.956 3.65139 17.8735C3.49385 17.791 3.35865 17.6715 3.25739 17.5254C3.15613 17.3792 3.09182 17.2106 3.06997 17.0341C3.04813 16.8576 3.0694 16.6785 3.13197 16.512L3.17797 16.407L4.89497 12.974C4.94658 12.8702 4.97974 12.7582 4.99297 12.643L4.99997 12.528V9C4.99997 7.14349 5.73747 5.36301 7.05022 4.05025C8.36298 2.7375 10.1435 2 12 2ZM17.5 3C18.163 3 18.7989 3.26339 19.2677 3.73224C19.7366 4.20108 20 4.83696 20 5.5C20 6.16304 19.7366 6.79893 19.2677 7.26777C18.7989 7.73661 18.163 8 17.5 8C16.8369 8 16.201 7.73661 15.7322 7.26777C15.2634 6.79893 15 6.16304 15 5.5C15 4.83696 15.2634 4.20108 15.7322 3.73224C16.201 3.26339 16.8369 3 17.5 3ZM12 21C11.3793 21.0003 10.7738 20.8081 10.267 20.4499C9.76013 20.0917 9.37685 19.5852 9.16997 19H14.83C14.6231 19.5852 14.2398 20.0917 13.733 20.4499C13.2261 20.8081 12.6206 21.0003 12 21Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🔔</Text>;
}

function CheckIcon({ size = 16, color = '#32CD32' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17L4 12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>✓</Text>;
}

function TimerIcon({ size = 18, color = '#EBEBF5' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="13" r="8" stroke={color} strokeWidth="2" />
                <path d="M12 9V13L15 15" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <path d="M9 3H15" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>⏱️</Text>;
}

function PaceClockIcon({ size = 18, color = '#EBEBF5' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
                <path d="M12 7V12L16 14" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>⏱️</Text>;
}

function ArrowRightIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>→</Text>;
}

// Proximo workout icon with container
function ProximoIcon({ size = 47 }: { size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 47 47" fill="none">
                <rect x="0.5" y="0.5" width="46" height="46" rx="9.5" fill="#007F99" fillOpacity="0.5" />
                <rect x="0.5" y="0.5" width="46" height="46" rx="9.5" stroke="#00D4FF" />
                <path d="M27.25 18.5C27.8467 18.5 28.419 18.2629 28.841 17.841C29.263 17.419 29.5 16.8467 29.5 16.25C29.5 15.6533 29.263 15.081 28.841 14.659C28.419 14.2371 27.8467 14 27.25 14C26.6533 14 26.081 14.2371 25.659 14.659C25.2371 15.081 25 15.6533 25 16.25C25 16.8467 25.2371 17.419 25.659 17.841C26.081 18.2629 26.6533 18.5 27.25 18.5ZM24.383 18.499C22.888 18.289 19.471 18.896 18.063 22.649C17.9699 22.8974 17.9793 23.1726 18.0891 23.414C18.1989 23.6555 18.4001 23.8434 18.6485 23.9365C18.8969 24.0296 19.1721 24.0202 19.4135 23.9104C19.655 23.8006 19.8429 23.5994 19.936 23.351C20.52 21.796 21.572 21.035 22.51 20.696L21.34 23.702C21.3207 23.752 21.3057 23.802 21.295 23.852C21.2471 24.0057 21.237 24.1687 21.2655 24.3271C21.2941 24.4855 21.3604 24.6347 21.459 24.762L25.021 29.369L25.252 33.062C25.2586 33.1942 25.2913 33.3238 25.3484 33.4432C25.4054 33.5627 25.4856 33.6696 25.5843 33.7578C25.6829 33.846 25.7981 33.9138 25.9232 33.9571C26.0483 34.0005 26.1807 34.0186 26.3128 34.0104C26.4449 34.0022 26.574 33.9678 26.6928 33.9093C26.8115 33.8508 26.9174 33.7693 27.0044 33.6696C27.0914 33.5698 27.1578 33.4538 27.1996 33.3282C27.2414 33.2026 27.2578 33.07 27.248 32.938L26.978 28.631L24.886 25.924L26.259 23.263L26.352 23.397C26.6124 23.7754 26.9951 24.0526 27.4358 24.1821C27.8765 24.3116 28.3483 24.2854 28.772 24.108L30.887 23.222C31.1255 23.1155 31.3129 22.9199 31.409 22.677C31.5051 22.4341 31.5024 22.1632 31.4014 21.9223C31.3005 21.6814 31.1092 21.4896 30.8686 21.3879C30.628 21.2861 30.3572 21.2826 30.114 21.378L27.999 22.264L26.393 19.929C26.0232 19.2888 25.4326 18.8053 24.732 18.569C24.6188 18.5308 24.5012 18.5073 24.382 18.499" fill="#00D4FF" />
                <path d="M20.4499 28.45L21.2769 25.998L22.7459 27.898L22.3439 29.089C22.2027 29.5078 21.9267 29.868 21.559 30.1133C21.1914 30.3586 20.7529 30.4753 20.3119 30.445L17.4319 30.248C17.3009 30.2391 17.1729 30.2044 17.0552 30.146C16.9375 30.0876 16.8325 30.0066 16.7462 29.9076C16.6598 29.8086 16.5938 29.6936 16.5519 29.5691C16.51 29.4446 16.493 29.3131 16.5019 29.182C16.5109 29.0509 16.5455 28.9229 16.6039 28.8053C16.6623 28.6876 16.7434 28.5826 16.8423 28.4962C16.9413 28.4099 17.0564 28.3439 17.1809 28.3019C17.3054 28.26 17.4369 28.2431 17.5679 28.252L20.4499 28.45Z" fill="#00D4FF" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏃</Text>;
}

// Modal Icons
function DistanceIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M13.5 5.5C14.6046 5.5 15.5 4.60457 15.5 3.5C15.5 2.39543 14.6046 1.5 13.5 1.5C12.3954 1.5 11.5 2.39543 11.5 3.5C11.5 4.60457 12.3954 5.5 13.5 5.5Z" fill={color} />
                <path d="M5 21L8.5 15L11 18L15 12L20 21H5Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>📏</Text>;
}

function RPEIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" />
                <path d="M12 6V12L16 14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>⚡</Text>;
}

function ClockOutlineIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
                <path d="M12 7V12L15 14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>⏰</Text>;
}

function RunnerWarmupIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M13.5 5.5C14.6 5.5 15.5 4.6 15.5 3.5C15.5 2.4 14.6 1.5 13.5 1.5C12.4 1.5 11.5 2.4 11.5 3.5C11.5 4.6 12.4 5.5 13.5 5.5ZM9.89 19.38L10.89 14.47L13 16.5V23H15V15.15L12.86 13.11L13.5 9.77C14.85 11.3 16.87 12.35 19.1 12.57V10.57C17.2 10.35 15.6 9.26 14.67 7.76L13.5 5.82C13.13 5.22 12.5 4.82 11.75 4.82C11.41 4.82 11.09 4.91 10.79 5.06L6 7.17V12H8V8.36L9.07 7.87L7.5 16.9L2.85 15.9L2.35 17.85L9.89 19.38Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏃</Text>;
}

function RunnerSprintIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M16.5 5.5C17.6 5.5 18.5 4.6 18.5 3.5C18.5 2.4 17.6 1.5 16.5 1.5C15.4 1.5 14.5 2.4 14.5 3.5C14.5 4.6 15.4 5.5 16.5 5.5ZM12.9 19.4L13.9 14.5L16 16.5V23H18V15.2L15.9 13.1L16.5 9.8C17.9 11.3 19.9 12.4 22.1 12.6V10.6C20.2 10.4 18.6 9.3 17.7 7.8L16.5 5.8C16.1 5.2 15.5 4.8 14.7 4.8C14.4 4.8 14.1 4.9 13.8 5.1L9 7.2V12H11V8.4L12.1 7.9L10.5 16.9L5.9 15.9L5.4 17.9L12.9 19.4Z" fill={color} />
                <path d="M3 11H7" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <path d="M4 8H8" stroke={color} strokeWidth="2" strokeLinecap="round" />
                <path d="M5 14H9" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏃‍♂️</Text>;
}

function CooldownIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M13.5 5.5C14.6 5.5 15.5 4.6 15.5 3.5C15.5 2.4 14.6 1.5 13.5 1.5C12.4 1.5 11.5 2.4 11.5 3.5C11.5 4.6 12.4 5.5 13.5 5.5Z" fill={color} />
                <path d="M17.5 8L19.5 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
                <path d="M18.5 10L21 9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
                <path d="M9.89 19.38L10.89 14.47L13 16.5V23H15V15.15L12.86 13.11L13.5 9.77C14 10.35 14.6 10.85 15.25 11.26L13.5 5.82C13.13 5.22 12.5 4.82 11.75 4.82C11.41 4.82 11.09 4.91 10.79 5.06L6 7.17V12H8V8.36L9.07 7.87L7.5 16.9L2.85 15.9L2.35 17.85L9.89 19.38Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🚶</Text>;
}

function IdeaIcon({ size = 24, color = '#FFD700' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8.13 2 5 5.13 5 9C5 11.38 6.19 13.47 8 14.74V17C8 17.55 8.45 18 9 18H15C15.55 18 16 17.55 16 17V14.74C17.81 13.47 19 11.38 19 9C19 5.13 15.87 2 12 2ZM14.85 13.1L14 13.7V16H10V13.7L9.15 13.1C7.8 12.16 7 10.63 7 9C7 6.24 9.24 4 12 4C14.76 4 17 6.24 17 9C17 10.63 16.2 12.16 14.85 13.1ZM9 20H15V21C15 21.55 14.55 22 14 22H10C9.45 22 9 21.55 9 21V20Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>💡</Text>;
}

function RunFastIcon({ size = 30, color = '#0E0E1F' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M16.5 5.5C17.6 5.5 18.5 4.6 18.5 3.5C18.5 2.4 17.6 1.5 16.5 1.5C15.4 1.5 14.5 2.4 14.5 3.5C14.5 4.6 15.4 5.5 16.5 5.5ZM12.9 19.4L13.9 14.5L16 16.5V23H18V15.2L15.9 13.1L16.5 9.8C17.9 11.3 19.9 12.4 22.1 12.6V10.6C20.2 10.4 18.6 9.3 17.7 7.8L16.5 5.8C16.1 5.2 15.5 4.8 14.7 4.8C14.4 4.8 14.1 4.9 13.8 5.1L9 7.2V12H11V8.4L12.1 7.9L10.5 16.9L5.9 15.9L5.4 17.9L12.9 19.4ZM3 11H7M4 8H8M5 14H9" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏃</Text>;
}

function CloseIcon({ size = 24, color = '#EBEBF5' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>✕</Text>;
}

// Workout data interface
interface WorkoutBlock {
    id: string;
    title: string;
    subtitle: string;
    type: 'warmup' | 'main' | 'cooldown';
    duration?: string;
    description?: string;
    pace?: string;
    recovery?: string;
}

interface WorkoutData {
    id: string;
    title: string;
    distance: string;
    duration: string;
    rpe: string;
    blocks: WorkoutBlock[];
    insight: string;
}

// Mock workout data
const mockWorkoutData: WorkoutData = {
    id: '1',
    title: 'Intervalados - 8x400m',
    distance: '8.5 km',
    duration: '55 min',
    rpe: 'RPE 7/10',
    blocks: [
        {
            id: '1',
            title: 'Aquecimento',
            subtitle: 'Bloco 01',
            type: 'warmup',
            duration: '10 min',
            description: 'Trote leve z1/z2 para ativar',
        },
        {
            id: '2',
            title: 'Tiros de 400m',
            subtitle: 'Bloco 02 - PRINCIPAL',
            type: 'main',
            duration: '8x400m',
            description: 'Ritmo forte, focado na técnica',
            pace: '3:45/km',
            recovery: 'Recuperação 1:30 min\nTrote ou caminhada leve',
        },
        {
            id: '3',
            title: 'Desaquecimento',
            subtitle: 'Bloco 03',
            type: 'cooldown',
            duration: '10 min',
            description: 'Trote muito leve + alongamento estático.',
        },
    ],
    insight: 'Você descansou bem ontem. Sua prontidão está alta. Tente focar em aumentar a cadência nos últimos 2 tiros quando o cansaço bater.',
};

// Lock Icon SVG Component
function LockIcon({ size = 60, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path
                    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                    fill={color}
                />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>🔒</Text>;
}

export function CalendarScreen({ navigation }: any) {
    const { workouts, fetchWorkouts, upcomingWorkouts, fetchUpcomingWorkouts, plan, fetchPlan, generationStatus, checkPlanStatus } = useTrainingStore();
    const { summary, fetchSummary } = useStatsStore();
    const [selectedDate, setSelectedDate] = React.useState(new Date().getDate());
    const [currentMonth, setCurrentMonth] = React.useState(new Date());
    const [isScheduleLocked, setIsScheduleLocked] = React.useState(false);

    // Modal states
    const [modalVisible, setModalVisible] = React.useState(false);
    const [selectedWorkout, setSelectedWorkout] = React.useState<WorkoutData | null>(null);
    const [showStartButton, setShowStartButton] = React.useState(false);
    const lastClickedDate = React.useRef<number | null>(null);
    const lastClickTime = React.useRef<number>(0);
    const modalSlideAnim = React.useRef(new Animated.Value(0)).current;
    const pollingInterval = React.useRef<NodeJS.Timeout | null>(null);

    const DOUBLE_CLICK_DELAY = 400; // ms
    const POLLING_INTERVAL = 3000; // 3 seconds

    // Fetch plan on mount
    React.useEffect(() => {
        fetchPlan();
    }, []);

    // Check if schedule is locked based on generation status
    React.useEffect(() => {
        const isLocked = generationStatus === 'partial' || generationStatus === 'generating';
        setIsScheduleLocked(isLocked);

        // Start polling if locked
        if (isLocked && plan?.id) {
            pollingInterval.current = setInterval(async () => {
                const isComplete = await checkPlanStatus(plan.id);
                if (isComplete) {
                    setIsScheduleLocked(false);
                    if (pollingInterval.current) {
                        clearInterval(pollingInterval.current);
                        pollingInterval.current = null;
                    }
                }
            }, POLLING_INTERVAL);
        }

        return () => {
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
                pollingInterval.current = null;
            }
        };
    }, [generationStatus, plan?.id]);

    React.useEffect(() => {
        const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        fetchWorkouts(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
        fetchUpcomingWorkouts();
        fetchSummary();
    }, [currentMonth]);

    // Helper: Transform API workout to UI WorkoutData format
    const transformWorkoutToUI = (workout: any): WorkoutData => {
        const blocks: WorkoutBlock[] = (workout.instructions_json || []).map((segment: any, index: number) => ({
            id: String(index + 1),
            title: segment.type === 'warmup' ? 'Aquecimento' : segment.type === 'cooldown' ? 'Desaquecimento' : 'Principal',
            subtitle: `Bloco ${String(index + 1).padStart(2, '0')}${segment.type === 'main' ? ' - PRINCIPAL' : ''}`,
            type: segment.type,
            duration: `${segment.distance_km} km`,
            description: segment.type === 'warmup'
                ? 'Trote leve z1/z2 para ativar'
                : segment.type === 'cooldown'
                    ? 'Trote muito leve + alongamento estático.'
                    : 'Ritmo forte, focado na técnica',
            pace: segment.pace_min && segment.pace_max
                ? `${segment.pace_min.toFixed(0)}:${((segment.pace_min % 1) * 60).toFixed(0).padStart(2, '0')}/km`
                : undefined,
        }));

        const workoutTypeLabels: Record<string, string> = {
            'easy_run': 'Rodagem Leve',
            'long_run': 'Longão',
            'intervals': 'Intervalados',
            'tempo': 'Tempo Run',
            'recovery': 'Recuperação',
        };

        return {
            id: workout.id,
            title: `${workoutTypeLabels[workout.type] || workout.type} - ${workout.distance_km}km`,
            distance: `${workout.distance_km} km`,
            duration: `${Math.round(workout.distance_km * 6)} min`, // Estimate based on 6 min/km
            rpe: 'RPE 6/10',
            blocks,
            insight: workout.objective || 'Mantenha o foco e aproveite o treino!'
        };
    };

    // Helper: Find workout for a specific day
    const getWorkoutForDay = (day: number) => {
        const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return workouts.find(w => w.scheduled_date === dateStr);
    };

    // Handle day press with double-click detection
    const handleDayPress = (day: number) => {
        const now = Date.now();
        const timeDiff = now - lastClickTime.current;

        if (lastClickedDate.current === day && timeDiff < DOUBLE_CLICK_DELAY) {
            // Double click detected - open modal without start button
            openWorkoutModal(day, false);
        } else {
            // Single click - select the day
            setSelectedDate(day);
        }

        lastClickedDate.current = day;
        lastClickTime.current = now;
    };

    // Open workout modal
    const openWorkoutModal = (day: number, withStartButton: boolean = false) => {
        const workout = getWorkoutForDay(day);
        if (workout) {
            setSelectedWorkout(transformWorkoutToUI(workout));
            setShowStartButton(withStartButton);
            setModalVisible(true);
            Animated.spring(modalSlideAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        }
    };

    // Close modal
    const closeModal = () => {
        Animated.timing(modalSlideAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setModalVisible(false);
            setSelectedWorkout(null);
            setShowStartButton(false);
        });
    };

    // Handle next workout card press (without start button)
    const handleNextWorkoutPress = () => {
        if (upcomingWorkouts.length > 1) {
            setSelectedWorkout(transformWorkoutToUI(upcomingWorkouts[1]));
            setShowStartButton(false);
            setModalVisible(true);
            Animated.spring(modalSlideAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        }
    };

    // Handle today's workout card press (with start button)
    const handleTodayWorkoutPress = () => {
        if (upcomingWorkouts.length > 0) {
            setSelectedWorkout(transformWorkoutToUI(upcomingWorkouts[0]));
            setShowStartButton(true);
            setModalVisible(true);
            Animated.spring(modalSlideAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        }
    };

    const getDaysInMonth = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }
        return days;
    };

    // Get workout status for a day based on real data
    const getWorkoutStatus = (day: number | null) => {
        if (!day) return null;
        const workout = getWorkoutForDay(day);
        if (!workout) return null;
        if (workout.status === 'completed') return 'completed';
        if (workout.status === 'pending') return 'planned';
        return null;
    };

    // Get today's workout from upcoming workouts
    const todayWorkout = upcomingWorkouts.length > 0 ? upcomingWorkouts[0] : null;
    const nextWorkout = upcomingWorkouts.length > 1 ? upcomingWorkouts[1] : null;

    // Calculate total volume and frequency
    const totalVolume = workouts.reduce((sum, w) => sum + (w.distance_km || 0), 0);
    const completedCount = workouts.filter(w => w.status === 'completed').length;
    const totalCount = workouts.length;

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    const days = getDaysInMonth();

    return (
        <SafeAreaView style={styles.container}>
            {/* Locked State Overlay */}
            {isScheduleLocked && (
                <View style={styles.lockedOverlay}>
                    <View style={styles.lockedContent}>
                        <LockIcon size={80} color="#00D4FF" />
                        <Text style={styles.lockedTitle}>Cronograma em Preparação</Text>
                        <Text style={styles.lockedMessage}>
                            Aguarde alguns instantes até que seu cronograma de treino fique completo.
                        </Text>
                        <View style={styles.lockedLoadingDots}>
                            <View style={[styles.loadingDot, styles.loadingDot1]} />
                            <View style={[styles.loadingDot, styles.loadingDot2]} />
                            <View style={[styles.loadingDot, styles.loadingDot3]} />
                        </View>
                    </View>
                </View>
            )}

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <BackIcon size={24} color="#00D4FF" />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerSubtitle}>Agenda</Text>
                        <Text style={styles.headerTitle}>Calendário</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.notificationButton}
                        onPress={() => navigation.navigate('Notifications')}
                    >
                        <BellIcon size={24} color="#EBEBF5" />
                    </TouchableOpacity>
                </View>

                {/* Stats Bar */}
                <View style={styles.statsBar}>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Volume</Text>
                        <View style={styles.statValueRow}>
                            <Text style={styles.statValue}>{Math.round(summary?.total_distance_km || 0)}</Text>
                            <Text style={styles.statUnit}> km</Text>
                        </View>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Frequência</Text>
                        <View style={styles.statValueRow}>
                            <Text style={styles.statValue}>{summary?.total_runs || 0}</Text>
                            <Text style={styles.statUnitMuted}> dias</Text>
                        </View>
                    </View>
                </View>

                {/* Month Selector */}
                <View style={styles.monthSelector}>
                    <Text style={styles.monthTitle}>
                        {monthNames[currentMonth.getMonth()]} <Text style={styles.yearText}>{currentMonth.getFullYear()}</Text>
                    </Text>
                    <View style={styles.monthNav}>
                        <TouchableOpacity
                            style={styles.monthNavButton}
                            onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                        >
                            <Text style={styles.chevronIcon}>‹</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.monthNavButton}
                            onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                        >
                            <Text style={styles.chevronIcon}>›</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Calendar Grid */}
                <View style={styles.calendarContainer}>
                    {/* Week days header */}
                    <View style={styles.weekDaysRow}>
                        {weekDays.map((day, i) => (
                            <Text key={i} style={styles.weekDayText}>{day}</Text>
                        ))}
                    </View>

                    {/* Days grid */}
                    <View style={styles.daysGrid}>
                        {days.map((day, index) => {
                            const workoutStatus = getWorkoutStatus(day);
                            const isSelected = day === selectedDate;

                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.dayCell}
                                    onPress={() => day && handleDayPress(day)}
                                    disabled={!day}
                                >
                                    {day ? (
                                        <View style={[
                                            styles.dayContent,
                                            isSelected && styles.daySelected,
                                        ]}>
                                            <Text style={[
                                                styles.dayNumber,
                                                isSelected && styles.dayNumberSelected,
                                            ]}>
                                                {day}
                                            </Text>
                                            {/* Workout indicator */}
                                            {workoutStatus === 'completed' && !isSelected && (
                                                <View style={styles.completedIndicator}>
                                                    <CheckIcon size={14} color="#32CD32" />
                                                </View>
                                            )}
                                            {workoutStatus === 'planned' && !isSelected && (
                                                <View style={styles.plannedIndicator} />
                                            )}
                                        </View>
                                    ) : null}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Legend - inside calendar card */}
                    <View style={styles.legend}>
                        <View style={styles.legendItem}>
                            <View style={styles.legendLine} />
                            <Text style={styles.legendText}>Rodagem</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendLine, styles.legendLineCyan]} />
                            <Text style={styles.legendText}>Intervalado</Text>
                        </View>
                    </View>
                </View>

                {/* Today's Workouts Section */}
                <View style={styles.todaySection}>
                    <View style={styles.todaySectionHeader}>
                        <View>
                            <Text style={styles.todayDate}>• Hoje, {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).toUpperCase()}</Text>
                            <Text style={styles.todayTitle}>Treinos do dia</Text>
                        </View>
                        <View style={styles.totalKm}>
                            <Text style={styles.totalKmValue}>{todayWorkout?.distance_km || 0} <Text style={styles.totalKmUnit}>km</Text></Text>
                            <Text style={styles.totalKmLabel}>total</Text>
                        </View>
                    </View>

                    {/* Workout Detail Card */}
                    {todayWorkout ? (
                        <View style={styles.workoutDetailCard}>
                            {/* Card Top Section */}
                            <View style={styles.cardTopSection}>
                                <View style={styles.workoutDetailHeader}>
                                    <View style={styles.intensityBadge}>
                                        <Text style={styles.intensityText}>
                                            {todayWorkout.type === 'intervals' || todayWorkout.type === 'tempo' ? 'ALTA INTENSIDADE' : 'MODERADO'}
                                        </Text>
                                    </View>
                                    <View style={styles.pendingBadge}>
                                        <View style={styles.pendingDot} />
                                        <Text style={styles.pendingText}>
                                            {todayWorkout.status === 'completed' ? 'Concluído' : 'Pendente'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.workoutDetailBody}>
                                    <View style={styles.workoutInfo}>
                                        <Text style={styles.workoutTitle}>
                                            {(() => {
                                                const labels: Record<string, string> = {
                                                    'easy_run': 'Rodagem Leve',
                                                    'long_run': 'Longão',
                                                    'intervals': 'Intervalados',
                                                    'tempo': 'Tempo Run',
                                                    'recovery': 'Recuperação',
                                                };
                                                return `${labels[todayWorkout.type] || todayWorkout.type} - ${todayWorkout.distance_km}km`;
                                            })()}
                                        </Text>
                                        <Text style={styles.workoutDescription}>{todayWorkout.objective || 'Treino do dia'}</Text>
                                        <View style={styles.workoutMetrics}>
                                            <View style={styles.metricItem}>
                                                <TimerIcon size={20} color="#00D4FF" />
                                                <Text style={styles.metricText}>{Math.round(todayWorkout.distance_km * 6)} min</Text>
                                            </View>
                                            <View style={styles.metricItem}>
                                                <PaceClockIcon size={20} color="#00D4FF" />
                                                <Text style={styles.metricText}>
                                                    {todayWorkout.instructions_json?.[0]?.pace_min
                                                        ? `${Math.floor(todayWorkout.instructions_json[0].pace_min)}:${String(Math.round((todayWorkout.instructions_json[0].pace_min % 1) * 60)).padStart(2, '0')} /km`
                                                        : '6:00 /km'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                    <Image
                                        source={{ uri: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=100&h=100&fit=crop' }}
                                        style={styles.workoutImage}
                                    />
                                </View>
                            </View>

                            {/* View Details Button - Bottom Section of Card */}
                            <TouchableOpacity
                                style={styles.viewDetailsButton}
                                onPress={handleTodayWorkoutPress}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.viewDetailsText}>Ver detalhes do  treino</Text>
                                <ArrowRightIcon size={20} color="#FFFFFF" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.workoutDetailCard}>
                            <View style={styles.cardTopSection}>
                                <Text style={[styles.workoutTitle, { textAlign: 'center', paddingVertical: 20 }]}>
                                    Nenhum treino agendado para hoje
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Next Workout Section */}
                    {nextWorkout && (
                        <View style={styles.nextWorkoutSection}>
                            <View style={styles.nextWorkoutDivider} />
                            <Text style={styles.nextWorkoutLabel}>
                                Próximo: {(() => {
                                    const date = new Date(nextWorkout.scheduled_date);
                                    const days = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
                                    return days[date.getDay()];
                                })()}
                            </Text>
                            <TouchableOpacity
                                style={styles.nextWorkoutCard}
                                onPress={handleNextWorkoutPress}
                                activeOpacity={0.7}
                            >
                                <ProximoIcon size={47} />
                                <View style={styles.nextWorkoutInfo}>
                                    <Text style={styles.nextWorkoutTitle}>
                                        {(() => {
                                            const labels: Record<string, string> = {
                                                'easy_run': 'Rodagem Leve',
                                                'long_run': 'Longão',
                                                'intervals': 'Intervalados',
                                                'tempo': 'Tempo Run',
                                                'recovery': 'Recuperação',
                                            };
                                            return `${labels[nextWorkout.type] || nextWorkout.type} de ${nextWorkout.distance_km}km`;
                                        })()}
                                    </Text>
                                    <Text style={styles.nextWorkoutSubtitle}>
                                        {nextWorkout.type === 'intervals' || nextWorkout.type === 'tempo'
                                            ? 'Corrida de rua - alta intensidade'
                                            : 'Corrida de rua - média intensidade'}
                                    </Text>
                                </View>
                                <ArrowRightIcon size={24} color="rgba(235,235,245,0.3)" />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Workout Details Modal */}
            <Modal
                visible={modalVisible}
                transparent={true}
                animationType="none"
                onRequestClose={closeModal}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={closeModal}
                >
                    <Animated.View
                        style={[
                            styles.modalContainer,
                            {
                                transform: [{
                                    translateY: modalSlideAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [Dimensions.get('window').height, 0],
                                    })
                                }]
                            }
                        ]}
                    >
                        <TouchableOpacity activeOpacity={1} style={styles.modalInnerContainer}>
                            {/* Drag Handle */}
                            <View style={styles.modalHandle} />

                            {/* Modal Header */}
                            <Text style={styles.modalTitle}>
                                {selectedWorkout?.title || 'Treino do Dia'}
                            </Text>

                            {/* Scrollable Content */}
                            <ScrollView
                                style={styles.modalScrollView}
                                contentContainerStyle={styles.modalScrollContent}
                                showsVerticalScrollIndicator={false}
                                bounces={false}
                            >
                                {/* Metrics Badges */}
                                <View style={styles.modalBadges}>
                                    <View style={styles.modalBadge}>
                                        <DistanceIcon size={16} color="#00D4FF" />
                                        <Text style={styles.modalBadgeText}>{selectedWorkout?.distance}</Text>
                                    </View>
                                    <View style={styles.modalBadge}>
                                        <TimerIcon size={16} color="#00D4FF" />
                                        <Text style={styles.modalBadgeText}>{selectedWorkout?.duration}</Text>
                                    </View>
                                    <View style={styles.modalBadge}>
                                        <RPEIcon size={16} color="#00D4FF" />
                                        <Text style={styles.modalBadgeText}>{selectedWorkout?.rpe}</Text>
                                    </View>
                                </View>

                                {/* Workout Blocks */}
                                {selectedWorkout?.blocks.map((block, index) => (
                                    <View
                                        key={block.id}
                                        style={[
                                            styles.workoutBlock,
                                            block.type === 'main' && styles.workoutBlockMain
                                        ]}
                                    >
                                        {/* Block Header */}
                                        <View style={styles.blockHeader}>
                                            <View>
                                                <Text style={[
                                                    styles.blockSubtitle,
                                                    block.type === 'main' && styles.blockSubtitleMain
                                                ]}>
                                                    {block.subtitle}
                                                </Text>
                                                <Text style={styles.blockTitle}>{block.title}</Text>
                                            </View>
                                            {block.type === 'warmup' && <RunnerWarmupIcon size={28} color="#00D4FF" />}
                                            {block.type === 'main' && <RunnerSprintIcon size={28} color="#00D4FF" />}
                                            {block.type === 'cooldown' && <CooldownIcon size={28} color="#00D4FF" />}
                                        </View>

                                        {/* Block Content */}
                                        <View style={styles.blockContent}>
                                            {/* For main block: show duration and pace on same line */}
                                            {block.type === 'main' && block.pace ? (
                                                <>
                                                    <View style={styles.blockDurationPaceRow}>
                                                        <View style={styles.blockDurationWithIcon}>
                                                            <ClockOutlineIcon size={18} color="rgba(235,235,245,0.6)" />
                                                            <Text style={styles.blockDuration}>{block.duration}</Text>
                                                        </View>
                                                        <Text style={styles.blockPace}>{block.pace}</Text>
                                                    </View>
                                                    <Text style={styles.blockDescriptionMain}>{block.description}</Text>
                                                </>
                                            ) : (
                                                <>
                                                    <View style={styles.blockDurationRow}>
                                                        <ClockOutlineIcon size={18} color="rgba(235,235,245,0.6)" />
                                                        <Text style={styles.blockDuration}>{block.duration}</Text>
                                                    </View>
                                                    <Text style={styles.blockDescription}>{block.description}</Text>
                                                </>
                                            )}

                                            {/* Recovery section for main block */}
                                            {block.type === 'main' && block.recovery && (
                                                <View style={styles.blockRecovery}>
                                                    <Text style={styles.blockRecoveryTitle}>Recuperação 1:30 min</Text>
                                                    <Text style={styles.blockRecoveryText}>Trote ou caminhada leve</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                ))}

                                {/* AI Insight Card */}
                                <View style={styles.insightCard}>
                                    <View style={styles.insightHeader}>
                                        <IdeaIcon size={20} color="#FFD700" />
                                        <Text style={styles.insightTitle}>RUNEASY TRAINING INSIGHT</Text>
                                    </View>
                                    <Text style={styles.insightText}>{selectedWorkout?.insight}</Text>
                                </View>

                                {/* Bottom spacing for scroll */}
                                <View style={{ height: showStartButton ? 20 : 40 }} />
                            </ScrollView>

                            {/* Fixed Start Workout Button at bottom */}
                            {showStartButton && (
                                <View style={styles.startWorkoutContainer}>
                                    <TouchableOpacity
                                        style={styles.startWorkoutButton}
                                        onPress={closeModal}
                                        activeOpacity={0.8}
                                    >
                                        <RunFastIcon size={24} color="#0E0E1F" />
                                        <Text style={styles.startWorkoutText}>Começar treino</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </TouchableOpacity>
                    </Animated.View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A18',
    },
    scrollView: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: '#00D4FF',
        letterSpacing: 1,
    },
    headerTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    notificationButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsBar: {
        flexDirection: 'row',
        backgroundColor: '#15152A',
        marginHorizontal: spacing.lg,
        marginVertical: spacing.md,
        borderRadius: borderRadius['2xl'],
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
        padding: spacing.md,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    statLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: 4,
    },
    statValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    statValue: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    statUnit: {
        fontSize: typography.fontSizes.sm,
        color: '#00D4FF',
    },
    statUnitMuted: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.4)',
    },
    monthSelector: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
        marginTop: spacing.md,
    },
    monthTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    yearText: {
        fontWeight: typography.fontWeights.normal as any,
        color: 'rgba(235, 235, 245, 0.4)',
    },
    monthNav: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    monthNavButton: {
        width: 32,
        height: 32,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    chevronIcon: {
        fontSize: 18,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    calendarContainer: {
        backgroundColor: '#1C1C2E',
        marginHorizontal: spacing.md,
        marginBottom: spacing.lg,
        borderRadius: 24,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.md,
    },
    weekDaysRow: {
        flexDirection: 'row',
        marginBottom: spacing.lg,
    },
    weekDayText: {
        flex: 1,
        textAlign: 'center',
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.4)',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    dayContent: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
        position: 'relative',
    },
    daySelected: {
        backgroundColor: '#00D4FF',
        width: 40,
        height: 56,
        borderRadius: 20,
    },
    dayNumber: {
        fontSize: 16,
        color: 'rgba(235, 235, 245, 0.8)',
    },
    dayNumberSelected: {
        fontWeight: typography.fontWeights.bold as any,
        color: '#0A0A18',
    },
    completedIndicator: {
        position: 'absolute',
        bottom: -8,
    },
    plannedIndicator: {
        position: 'absolute',
        bottom: -8,
        width: 20,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#00D4FF',
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        paddingHorizontal: spacing.md,
        gap: spacing.xl,
        marginTop: spacing.lg,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    legendLine: {
        width: 24,
        height: 2,
        backgroundColor: 'rgba(235, 235, 245, 0.3)',
    },
    legendLineCyan: {
        backgroundColor: '#00D4FF',
    },
    legendText: {
        fontSize: 16,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    todaySection: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        paddingBottom: 120,
    },
    todaySectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.lg,
    },
    todayDate: {
        fontSize: typography.fontSizes.xs,
        color: '#00D4FF',
        marginBottom: 4,
    },
    todayTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    totalKm: {
        alignItems: 'flex-end',
    },
    totalKmValue: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
    },
    totalKmUnit: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.normal as any,
    },
    totalKmLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.4)',
    },
    workoutDetailCard: {
        marginBottom: spacing.lg,
        borderRadius: 24,
        overflow: 'hidden',
    },
    cardTopSection: {
        backgroundColor: '#1C1C2E',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: spacing.lg,
    },
    workoutDetailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    intensityBadge: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#00D4FF',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
    },
    intensityText: {
        fontSize: 11,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
        letterSpacing: 0.5,
    },
    pendingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    pendingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FFC107',
    },
    pendingText: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    workoutDetailBody: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    workoutImage: {
        width: 72,
        height: 72,
        borderRadius: 36,
    },
    workoutInfo: {
        flex: 1,
    },
    workoutTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    workoutDescription: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: spacing.sm,
    },
    workoutMetrics: {
        flexDirection: 'row',
        gap: spacing.lg,
    },
    metricItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metricText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    viewDetailsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.lg,
        backgroundColor: '#0E0E1F',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
    },
    viewDetailsText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#FFFFFF',
    },
    nextWorkoutSection: {
        marginTop: spacing.lg,
    },
    nextWorkoutDivider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: spacing.lg,
    },
    nextWorkoutLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.4)',
        marginBottom: spacing.md,
    },
    nextWorkoutCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: '#1A1A2E',
        padding: spacing.md,
        borderRadius: borderRadius['2xl'],
    },
    nextWorkoutIconContainer: {
        width: 48,
        height: 48,
        borderRadius: borderRadius.xl,
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextWorkoutInfo: {
        flex: 1,
    },
    nextWorkoutTitle: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
    },
    nextWorkoutSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.6)',
        marginTop: 2,
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#1C1C2E',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    modalInnerContainer: {
        flex: 1,
        maxHeight: '100%',
    },
    modalScrollView: {
        flex: 1,
        paddingHorizontal: spacing.lg,
    },
    modalScrollContent: {
        paddingBottom: spacing.md,
    },
    modalHandle: {
        width: 60,
        height: 6,
        backgroundColor: 'rgba(235, 235, 245, 0.1)',
        borderRadius: 20,
        alignSelf: 'center',
        marginTop: spacing.lg,
        marginBottom: spacing.xl,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    modalBadges: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    modalBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
    },
    modalBadgeText: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#EBEBF5',
    },

    // Workout Block Styles
    workoutBlock: {
        backgroundColor: '#15152A',
        borderRadius: 16,
        marginBottom: spacing.md,
        overflow: 'hidden',
    },
    workoutBlockMain: {
        borderWidth: 1,
        borderColor: 'rgba(0, 212, 255, 0.3)',
    },
    blockHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    },
    blockSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235, 235, 245, 0.5)',
        marginBottom: 4,
    },
    blockSubtitleMain: {
        color: '#00D4FF',
        fontWeight: typography.fontWeights.bold as any,
    },
    blockTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    blockContent: {
        padding: spacing.md,
    },
    blockDurationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.xs,
    },
    blockDurationPaceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    blockDurationWithIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    blockDuration: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    blockDescription: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
        marginLeft: 26,
    },
    blockDescriptionMain: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },
    blockPaceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    blockPaceLabel: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
    },
    blockPace: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
    },
    blockRecovery: {
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    blockRecoveryTitle: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#EBEBF5',
        marginBottom: 4,
    },
    blockRecoveryText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.6)',
    },

    // Insight Card Styles
    insightCard: {
        backgroundColor: 'rgba(0, 127, 153, 0.3)',
        borderRadius: 16,
        padding: spacing.lg,
        marginTop: spacing.md,
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: '#00D4FF',
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    insightTitle: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
        letterSpacing: 0.5,
    },
    insightText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235, 235, 245, 0.8)',
        lineHeight: 20,
    },

    // Start Workout Button Container (Fixed at bottom)
    startWorkoutContainer: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        backgroundColor: '#1C1C2E',
    },
    startWorkoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: '#00D4FF',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: 20,
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
        elevation: 3,
    },
    startWorkoutText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#0E0E1F',
    },

    // Locked State Overlay Styles
    lockedOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(14, 14, 31, 0.95)',
        zIndex: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    lockedContent: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    lockedTitle: {
        fontSize: 22,
        fontWeight: '700' as any,
        color: '#EBEBF5',
        marginTop: 24,
        marginBottom: 12,
        textAlign: 'center',
    },
    lockedMessage: {
        fontSize: 15,
        fontWeight: '400' as any,
        color: 'rgba(235, 235, 245, 0.6)',
        textAlign: 'center',
        lineHeight: 22,
    },
    lockedLoadingDots: {
        flexDirection: 'row',
        marginTop: 24,
        gap: 8,
    },
    loadingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#00D4FF',
    },
    loadingDot1: {
        opacity: 0.4,
    },
    loadingDot2: {
        opacity: 0.7,
    },
    loadingDot3: {
        opacity: 1,
    },
});
