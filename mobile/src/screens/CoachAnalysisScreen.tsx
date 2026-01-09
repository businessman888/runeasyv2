import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Platform,
    Animated,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../theme';
import { useFeedbackStore } from '../stores/feedbackStore';
import { PoweredByStrava } from '../components/PoweredByStrava';

const { width: screenWidth } = Dimensions.get('window');

// SVG Icons with Ionicons fallback for native
function BackIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M20 11H7.83L13.42 5.41L12 4L4 12L12 20L13.41 18.59L7.83 13H20V11Z" />
            </svg>
        );
    }
    return <Ionicons name="arrow-back" size={size} color={color} />;
}

function ShareIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
                <path d="M4 12V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V12M16 6L12 2M12 2L8 6M12 2V15" />
            </svg>
        );
    }
    return <Ionicons name="share-outline" size={size} color={color} />;
}

function CheckIcon({ size = 40, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" />
            </svg>
        );
    }
    return <Ionicons name="checkmark" size={size} color={color} />;
}

function SpeedIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M20.38 8.57L19.25 10.22C20.33 11.78 21 13.67 21 15.69C21 16.58 20.86 17.43 20.62 18.24H3.38C3.14 17.43 3 16.58 3 15.69C3 10.41 7.03 6.1 12.14 5.51V3H14.14V5.51C16.45 5.81 18.5 6.87 20.02 8.43L18.88 10.09C17.55 8.66 15.71 7.69 13.64 7.51L13.6 7.5H13.14V9.6C13.14 10.18 12.68 10.64 12.1 10.64C11.92 10.64 11.74 10.59 11.59 10.51L7.62 8.2C7.35 8.04 7.25 7.69 7.41 7.41C7.57 7.14 7.92 7.04 8.2 7.2L11.1 8.87V7.51C8.44 7.76 6.12 9.02 4.62 10.93L3.5 9.27C5.25 7.1 7.94 5.66 11 5.51V3H13.14V5.51C14.5 5.63 15.79 6.03 16.94 6.66L18.06 5C15.83 3.72 13.22 3 10.44 3C6.39 3 2.86 4.93 0.62 7.97L2.14 9.12C3.38 7.42 5.12 6.06 7.14 5.2V7.3L4.62 8.88L8.59 11.19C9.03 11.44 9.55 11.53 10.05 11.44C10.55 11.35 11 11.09 11.34 10.71C11.53 10.5 11.64 10.24 11.64 9.96V8.5H12.14C14.73 8.68 17.06 9.94 18.62 11.86L20.14 10.22C18.41 8.15 16 6.73 13.3 6.31L13.36 6.32L18.25 3.2L19.62 4.88L14.73 8C17.04 8.24 19.11 9.21 20.74 10.68L19.61 12.33C18.48 11.25 17.05 10.47 15.46 10.12V12C15.46 12.3 15.71 12.54 16 12.54H17.5V14.54H16C14.62 14.54 13.46 13.39 13.46 12V10.33C12.23 10.5 11.05 10.92 10 11.54L8.66 9.89C9.79 9.17 11.09 8.69 12.5 8.5V7.5H11.5C8.94 7.74 6.65 9.03 5.15 10.95L3.65 9.29C5.36 7.14 8 5.66 11 5.51V3H9V5.54C5.47 5.93 2.42 7.88 0.62 10.69L2.14 11.84" />
            </svg>
        );
    }
    return <Ionicons name="speedometer" size={size} color={color} />;
}

function RouteIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M9 3L5.5 6.5L9 10V7C12.31 7 15 9.69 15 13C15 14.01 14.75 14.97 14.3 15.8L15.76 17.26C16.54 16.03 17 14.57 17 13C17 8.58 13.42 5 9 5V3ZM5.06 8.94C4.7 9.4 4.41 9.91 4.18 10.45C4.06 10.73 3.96 11.02 3.88 11.32C3.32 13.36 3.68 15.58 5.06 17.26L6.5 15.82C5.54 14.42 5.38 12.64 5.84 11.15C6.03 10.53 6.35 9.96 6.78 9.48L5.06 8.94ZM19.94 15.06C20.3 14.6 20.59 14.09 20.82 13.55C20.94 13.27 21.04 12.98 21.12 12.68C21.68 10.64 21.32 8.42 19.94 6.74L18.5 8.18C19.46 9.58 19.62 11.36 19.16 12.85C18.97 13.47 18.65 14.04 18.22 14.52L19.94 15.06ZM15 21L18.5 17.5L15 14V17C11.69 17 9 14.31 9 11C9 9.99 9.25 9.03 9.7 8.2L8.24 6.74C7.46 7.97 7 9.43 7 11C7 15.42 10.58 19 15 19V21Z" />
            </svg>
        );
    }
    return <Ionicons name="navigate" size={size} color={color} />;
}

function MountainIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M14 6L10.25 11L13.1 14.8L11.5 16C9.81 13.75 7 10 7 10L1 18H23L14 6Z" />
            </svg>
        );
    }
    return <Ionicons name="trending-up" size={size} color={color} />;
}

function ThumbUpIcon({ size = 24, color = '#32CD32' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M1 21H5V9H1V21ZM23 10C23 8.9 22.1 8 21 8H14.69L15.64 3.43L15.67 3.11C15.67 2.7 15.5 2.32 15.23 2.05L14.17 1L7.59 7.59C7.22 7.95 7 8.45 7 9V19C7 20.1 7.9 21 9 21H18C18.83 21 19.54 20.5 19.84 19.78L22.86 12.73C22.95 12.5 23 12.26 23 12V10Z" />
            </svg>
        );
    }
    return <Ionicons name="thumbs-up" size={size} color={color} />;
}

function AlertIcon({ size = 24, color = '#FFD700' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M1 21H23L12 2L1 21ZM13 18H11V16H13V18ZM13 14H11V10H13V14Z" />
            </svg>
        );
    }
    return <Ionicons name="warning" size={size} color={color} />;
}

// New Trophy Icon for Conquista card (yellow with circular background)
function ConquestaTrophyIcon({ size = 35 }: { size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 35 35" fill="none">
                <rect x="0.5" y="0.5" width="34" height="34" rx="17" fill="#FFC400" fillOpacity="0.3" />
                <rect x="0.5" y="0.5" width="34" height="34" rx="17" stroke="#FFC400" />
                <path d="M13 27V25H17V21.9C16.1833 21.7167 15.4543 21.371 14.813 20.863C14.1717 20.355 13.7007 19.7173 13.4 18.95C12.15 18.8 11.1043 18.2543 10.263 17.313C9.42167 16.3717 9.00067 15.2673 9 14V13C9 12.45 9.196 11.9793 9.588 11.588C9.98 11.1967 10.4507 11.0007 11 11H13V9H23V11H25C25.55 11 26.021 11.196 26.413 11.588C26.805 11.98 27.0007 12.4507 27 13V14C27 15.2667 26.579 16.371 25.737 17.313C24.895 18.255 23.8493 18.8007 22.6 18.95C22.3 19.7167 21.8293 20.3543 21.188 20.863C20.5467 21.3717 19.8173 21.7173 19 21.9V25H23V27H13ZM13 16.8V13H11V14C11 14.6333 11.1833 15.2043 11.55 15.713C11.9167 16.2217 12.4 16.584 13 16.8ZM23 16.8C23.6 16.5833 24.0833 16.2207 24.45 15.712C24.8167 15.2033 25 14.6327 25 14V13H23V16.8Z" fill="#FFC400" />
            </svg>
        );
    }
    return <Ionicons name="trophy" size={size} color="#FFC400" />;
}

// New Medal Icon for Conquista card (yellow circular with star medal)  
function ConquestaMedalIcon({ size = 64 }: { size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
                <rect x="1" y="1" width="62" height="62" rx="31" stroke="#FFC400" strokeWidth="2" />
                <path d="M32.5 24.2083C35.5942 24.2083 38.5616 25.4375 40.7496 27.6254C42.9375 29.8133 44.1666 32.7808 44.1666 35.875C44.1666 38.9692 42.9375 41.9367 40.7496 44.1246C38.5616 46.3125 35.5942 47.5417 32.5 47.5417C29.4058 47.5417 26.4383 46.3125 24.2504 44.1246C22.0625 41.9367 20.8333 38.9692 20.8333 35.875C20.8333 32.7808 22.0625 29.8133 24.2504 27.6254C26.4383 25.4375 29.4058 24.2083 32.5 24.2083ZM32.5 29.3125L30.5721 33.2208L26.2583 33.8479L29.3791 36.8885L28.6427 41.1848L32.5 39.1562L36.3573 41.1833L35.6208 36.8885L38.7416 33.8465L34.4279 33.2194L32.5 29.3125ZM33.9583 16.9152L41.25 16.9167V21.2917L39.2623 22.9512C37.6132 22.0852 35.8121 21.5464 33.9583 21.3646V16.9152ZM31.0416 16.9152V21.3631C29.1884 21.5451 27.3878 22.0839 25.7391 22.9498L23.75 21.2917V16.9167L31.0416 16.9152Z" fill="#FFC400" />
            </svg>
        );
    }
    return <Ionicons name="medal" size={size} color="#FFC400" />;
}

function TrophyIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 1.69003C12.0008 1.56816 11.9565 1.4503 11.8756 1.35911C11.7948 1.26793 11.6831 1.20984 11.562 1.19603C9.19455 0.934169 6.80545 0.934169 4.438 1.19603C4.31709 1.20982 4.20552 1.26776 4.12469 1.35874C4.04386 1.44972 3.99946 1.56733 4 1.68903V2.25603C3.18933 2.3607 2.38833 2.49603 1.597 2.66203C1.43199 2.69682 1.28353 2.78621 1.17557 2.91575C1.06761 3.0453 1.00647 3.20745 1.002 3.37603L1 3.50003C0.999879 4.66778 1.45371 5.78986 2.26561 6.62919C3.07751 7.46852 4.18388 7.95936 5.351 7.99803C5.82386 8.41603 6.38892 8.71621 7 8.87403V10H6C5.73478 10 5.48043 10.1054 5.29289 10.2929C5.10536 10.4805 5 10.7348 5 11V13H4.333C3.597 13 3 13.597 3 14.333C3 14.701 3.298 15 3.667 15H12.333C12.5099 15 12.6796 14.9298 12.8046 14.8047C12.9297 14.6796 13 14.5099 13 14.333C13 13.597 12.403 13 11.667 13H11V11C11 10.7348 10.8946 10.4805 10.7071 10.2929C10.5196 10.1054 10.2652 10 10 10H9V8.87403C9.61108 8.71621 10.1761 8.41603 10.649 7.99803C11.8377 7.95884 12.9625 7.45066 13.7777 6.58457C14.5928 5.71848 15.0319 4.56492 14.999 3.37603C14.9945 3.20732 14.9332 3.04506 14.825 2.91549C14.7169 2.78592 14.5682 2.69662 14.403 2.66203C13.6076 2.49525 12.806 2.35981 12 2.25603V1.69003Z" fill={color} />
            </svg>
        );
    }
    return <Ionicons name="trophy" size={size} color={color} />;
}

function MedalIcon({ size = 24, color = '#FFD700' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M12 4C13.93 4 15.68 4.78 16.95 6.05L17 6.1V2H15V4.06C14.06 3.38 12.97 3 12 3C10.42 3 8.91 3.66 7.82 4.76L7.5 5.08V2H5.5V6.1L5.55 6.05C6.82 4.78 8.57 4 10.5 4H12ZM5.16 8.5L7 12.47L12 22L17 12.47L18.84 8.5H5.16ZM12 8C13.11 8 14 8.9 14 10C14 11.11 13.11 12 12 12C10.9 12 10 11.11 10 10C10 8.9 10.9 8 12 8Z" />
            </svg>
        );
    }
    return <Ionicons name="medal" size={size} color={color} />;
}

function IdeaIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M12 2C8.14 2 5 5.14 5 9C5 11.38 6.19 13.47 8 14.74V17C8 17.55 8.45 18 9 18H15C15.55 18 16 17.55 16 17V14.74C17.81 13.47 19 11.38 19 9C19 5.14 15.86 2 12 2ZM14.85 13.1L14 13.7V16H10V13.7L9.15 13.1C7.8 12.16 7 10.63 7 9C7 6.24 9.24 4 12 4C14.76 4 17 6.24 17 9C17 10.63 16.2 12.16 14.85 13.1ZM10 20H14V21C14 21.55 13.55 22 13 22H11C10.45 22 10 21.55 10 21V20Z" />
            </svg>
        );
    }
    return <Ionicons name="bulb" size={size} color={color} />;
}

// Alarm icon for tip card
function AlarmIcon({ size = 23 }: { size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size * 1.17} viewBox="0 0 23 27" fill="none">
                <path d="M11.0356 5.15625C16.1971 5.15625 20.3813 9.34043 20.3813 14.502V21.3281C20.3813 21.5768 20.2825 21.8152 20.1067 21.991C19.9309 22.1669 19.6924 22.2656 19.4438 22.2656H2.62738C2.37874 22.2656 2.14028 22.1669 1.96447 21.991C1.78865 21.8152 1.68988 21.5768 1.68988 21.3281V14.502C1.68988 9.34043 5.87406 5.15625 11.0356 5.15625ZM10.2153 0H11.8559C11.9181 0 11.9777 0.0246931 12.0216 0.0686469C12.0656 0.112601 12.0903 0.172215 12.0903 0.234375V3.04688C12.0903 3.10904 12.0656 3.16865 12.0216 3.2126C11.9777 3.25656 11.9181 3.28125 11.8559 3.28125H10.2153C10.1531 3.28125 10.0935 3.25656 10.0495 3.2126C10.0056 3.16865 9.9809 3.10904 9.9809 3.04688V0.234375C9.9809 0.172215 10.0056 0.112601 10.0495 0.0686469C10.0935 0.0246931 10.1531 0 10.2153 0ZM1.22846 3.62285C1.25022 3.60106 1.27607 3.58377 1.30452 3.57198C1.33298 3.56018 1.36348 3.55411 1.39428 3.55411C1.42508 3.55411 1.45558 3.56018 1.48403 3.57198C1.51248 3.58377 1.53833 3.60106 1.5601 3.62285L3.54877 5.61152C3.59269 5.65547 3.61736 5.71506 3.61736 5.7772C3.61736 5.83933 3.59269 5.89892 3.54877 5.94287L2.38861 7.10303C2.34466 7.14695 2.28507 7.17162 2.22294 7.17162C2.1608 7.17162 2.10121 7.14695 2.05726 7.10303L0.0685926 5.11436C0.024672 5.07041 0 5.01082 0 4.94868C0 4.88655 0.024672 4.82696 0.0685926 4.78301L1.22875 3.62285H1.22846ZM20.8456 3.62285L22.0058 4.78301C22.0496 4.82694 22.0742 4.88647 22.0742 4.94854C22.0742 5.0106 22.0496 5.07013 22.0058 5.11406L20.0171 7.10332C19.9954 7.12511 19.9695 7.1424 19.9411 7.15419C19.9126 7.16599 19.8821 7.17206 19.8513 7.17206C19.8205 7.17206 19.79 7.16599 19.7616 7.15419C19.7331 7.1424 19.7073 7.12511 19.6855 7.10332L18.5253 5.94316C18.5035 5.9214 18.4863 5.89555 18.4745 5.8671C18.4627 5.83864 18.4566 5.80814 18.4566 5.77734C18.4566 5.74654 18.4627 5.71604 18.4745 5.68759C18.4863 5.65914 18.5035 5.63329 18.5253 5.61152L20.5143 3.62285C20.5582 3.57893 20.6178 3.55426 20.68 3.55426C20.7421 3.55426 20.8017 3.57893 20.8456 3.62285ZM1.66058 24.1406H20.4106C20.6592 24.1406 20.8977 24.2394 21.0735 24.4152C21.2493 24.591 21.3481 24.8295 21.3481 25.0781V25.7812C21.3481 25.8434 21.3234 25.903 21.2794 25.947C21.2355 25.9909 21.1759 26.0156 21.1137 26.0156H0.95746C0.8953 26.0156 0.835685 25.9909 0.791731 25.947C0.747777 25.903 0.723085 25.8434 0.723085 25.7812V25.0781C0.723085 24.8295 0.821857 24.591 0.997672 24.4152C1.17349 24.2394 1.41194 24.1406 1.66058 24.1406ZM5.99652 14.8535V22.2656H7.87152V14.8535H5.99652Z" fill="rgba(235,235,245,0.6)" />
            </svg>
        );
    }
    return <Ionicons name="notifications" size={size} color="rgba(235,235,245,0.6)" />;
}
// Heartbeat/ECG icon for VO2 card (left)
function HeartbeatIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
                <path d="M0.714294 10.1143H3.84287C3.9746 10.1128 4.10356 10.0763 4.21652 10.0085C4.32949 9.9407 4.4224 9.8441 4.48572 9.72858L7.05715 4.58572C7.12053 4.45768 7.22156 4.35209 7.34669 4.28314C7.47182 4.21419 7.61505 4.18518 7.75715 4.20001C7.89868 4.20957 8.03377 4.2628 8.14379 4.35235C8.2538 4.4419 8.33334 4.56336 8.37144 4.70001L11.5572 15.3C11.599 15.4438 11.6849 15.5708 11.8028 15.6631C11.9207 15.7554 12.0647 15.8083 12.2143 15.8143C12.3545 15.8096 12.4902 15.7638 12.6046 15.6825C12.7189 15.6012 12.8067 15.4881 12.8572 15.3571L14.8143 10.5714C14.8682 10.4372 14.9608 10.322 15.0804 10.2406C15.2 10.1592 15.3411 10.1152 15.4857 10.1143H19.2857" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Ionicons name="pulse" size={size} color={color} />;
}

// Trend Up icon for VO2 Max trend indicator
function TrendUpIcon({ size = 16, color = '#32CD32' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M16 6L18.29 8.29L13.41 13.17L9.41 9.17L2 16.59L3.41 18L9.41 12L13.41 16L19.71 9.71L22 12V6H16Z" />
            </svg>
        );
    }
    return <Ionicons name="trending-up" size={size} color={color} />;
}

// Battery icon for VO2 card (right)
function BatteryIcon({ size = 18, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
                <g clipPath="url(#clip0_battery)">
                    <path d="M11 2V1.31C11.0013 1.2706 10.9949 1.23132 10.981 1.19441C10.9672 1.1575 10.9462 1.12368 10.9193 1.09489C10.8923 1.0661 10.86 1.0429 10.8241 1.02662C10.7882 1.01034 10.7494 1.00129 10.71 1H7.29C7.2506 1.00129 7.21183 1.01034 7.17593 1.02662C7.14002 1.0429 7.10768 1.0661 7.08075 1.09489C7.05381 1.12368 7.03282 1.1575 7.01896 1.19441C7.00511 1.23132 6.99866 1.2706 7 1.31V2H5C4.8651 2.01116 4.73918 2.07212 4.64676 2.17102C4.55434 2.26991 4.50202 2.39966 4.5 2.535V16.535C4.50887 16.6615 4.56544 16.7798 4.65827 16.8661C4.75109 16.9525 4.87324 17.0003 5 17H13C13.1276 17.0002 13.2504 16.9517 13.3434 16.8643C13.4363 16.7769 13.4923 16.6573 13.5 16.53V2.53C13.4968 2.39553 13.4439 2.26701 13.3516 2.16916C13.2593 2.07132 13.1341 2.01107 13 2H11ZM10.13 12.72C10.2009 12.8626 10.2124 13.0275 10.1617 13.1784C10.1111 13.3294 10.0026 13.4541 9.86 13.525C9.71745 13.5959 9.55255 13.6074 9.40158 13.5567C9.25061 13.5061 9.12595 13.3976 9.055 13.255L6.325 7.78L9.325 8.28L8.18 6.28C8.1406 6.21171 8.11504 6.13633 8.10478 6.05817C8.09451 5.98 8.09974 5.90058 8.12017 5.82444C8.1406 5.74829 8.17583 5.67692 8.22384 5.61439C8.27185 5.55186 8.33171 5.4994 8.4 5.46C8.46829 5.4206 8.54367 5.39504 8.62183 5.38478C8.7 5.37451 8.77942 5.37974 8.85556 5.40017C8.93171 5.4206 9.00308 5.45583 9.06561 5.50384C9.12814 5.55185 9.1806 5.61171 9.22 5.68L11.635 9.865L8.45 9.35L10.13 12.72Z" fill={color} />
                </g>
                <defs>
                    <clipPath id="clip0_battery">
                        <rect width="18" height="18" fill="white" />
                    </clipPath>
                </defs>
            </svg>
        );
    }
    return <Ionicons name="battery-charging" size={size} color={color} />;
}

// Circular Score Component - New green check icon from Figma
function CircularScore({ percentage, size = 120 }: { percentage: number; size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                <svg width={size} height={size} viewBox="0 0 116 116" fill="none">
                    <defs>
                        <filter id="filter0_visto" x="0" y="0" width="116" height="116" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                            <feFlood floodOpacity="0" result="BackgroundImageFix" />
                            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                            <feOffset />
                            <feGaussianBlur stdDeviation="5" />
                            <feComposite in2="hardAlpha" operator="out" />
                            <feColorMatrix type="matrix" values="0 0 0 0 0.196078 0 0 0 0 0.803922 0 0 0 0 0.196078 0 0 0 0.2 0" />
                            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                        </filter>
                        <filter id="filter1_visto" x="37" y="36" width="47" height="47" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                            <feFlood floodOpacity="0" result="BackgroundImageFix" />
                            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                            <feOffset dx="2" dy="2" />
                            <feGaussianBlur stdDeviation="2" />
                            <feComposite in2="hardAlpha" operator="out" />
                            <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
                            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                        </filter>
                    </defs>
                    <g filter="url(#filter0_visto)">
                        <rect x="10" y="10" width="96" height="96" rx="48" fill="#15152A" />
                        <rect x="11.5" y="11.5" width="93" height="93" rx="46.5" stroke="#32CD32" strokeWidth="3" />
                        <g filter="url(#filter1_visto)">
                            <rect x="39" y="38" width="39" height="39" rx="19.5" fill="#32CD32" />
                            <path d="M56 62.17L51.83 58L50.41 59.41L56 65L68 53L66.59 51.59L56 62.17Z" fill="#15152A" />
                        </g>
                    </g>
                </svg>
                <Text style={{ color: '#32CD32', fontSize: 14, fontWeight: '600', marginTop: 8, position: 'absolute', bottom: -25 }}>
                    {percentage}%
                </Text>
            </View>
        );
    }

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15152A', borderRadius: size / 2, borderWidth: 3, borderColor: '#32CD32' }}>
            <View style={{ width: 40, height: 40, backgroundColor: '#32CD32', borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20, color: '#15152A' }}>✓</Text>
            </View>
            <Text style={{ color: '#32CD32', fontSize: 14, fontWeight: '600', position: 'absolute', bottom: -25 }}>{percentage}%</Text>
        </View>
    );
}

export function CoachAnalysisScreen({ navigation, route }: any) {
    const { feedbackId, activityId } = route?.params || {};
    const { currentFeedback, fetchFeedback, latestActivity, latestActivityLoading, fetchLatestActivity, isLoading } = useFeedbackStore();

    useEffect(() => {
        if (feedbackId) {
            // Load specific feedback from history/workout
            fetchFeedback(feedbackId);
        } else if (!latestActivity) {
            // Fetch latest activity if not already loaded
            fetchLatestActivity();
        }
    }, [feedbackId]);

    // Determine data source: from currentFeedback (if feedbackId provided) or latestActivity
    const activity = currentFeedback?.strava_activities || latestActivity?.activity;
    const feedback = currentFeedback || (latestActivity?.feedback ? {
        strengths: latestActivity.feedback.strengths,
        improvements: latestActivity.feedback.improvements,
        hero_message: latestActivity.feedback.hero_message,
        hero_tone: latestActivity.feedback.hero_tone,
    } : null);

    // Format pace from decimal minutes to mm:ss
    const formatPace = (paceMinPerKm: number | null | undefined): string => {
        if (!paceMinPerKm || paceMinPerKm === 0) return '--:--';
        const minutes = Math.floor(paceMinPerKm);
        const seconds = Math.round((paceMinPerKm - minutes) * 60);
        return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
    };

    // Build metrics from real data
    const metrics = activity ? [
        {
            icon: SpeedIcon,
            label: 'Pace',
            target: currentFeedback?.metrics_comparison?.pace?.planned || '--',
            actual: formatPace(activity.average_pace),
            iconBg: '#1A3A4A',
            iconColor: '#00D4FF',
            barColor: '#32CD32',
            progress: 100
        },
        {
            icon: RouteIcon,
            label: 'Distância',
            target: currentFeedback?.metrics_comparison?.distance?.planned
                ? `${currentFeedback.metrics_comparison.distance.planned} km`
                : '--',
            actual: activity.distance
                ? (activity.distance / 1000).toFixed(1)
                : '--',
            iconBg: '#2A1F3D',
            iconColor: '#9747FF',
            barColor: '#00D4FF',
            progress: 85
        },
        {
            icon: MountainIcon,
            label: 'Elevação',
            target: '--',
            actual: activity.elevation_gain?.toString() || '0',
            iconBg: '#3D3520',
            iconColor: '#FFB800',
            barColor: '#FFB800',
            progress: 75
        },
    ] : [
        { icon: SpeedIcon, label: 'Pace', target: '--', actual: '--', iconBg: '#1A3A4A', iconColor: '#00D4FF', barColor: '#32CD32', progress: 0 },
        { icon: RouteIcon, label: 'Distância', target: '--', actual: '--', iconBg: '#2A1F3D', iconColor: '#9747FF', barColor: '#00D4FF', progress: 0 },
        { icon: MountainIcon, label: 'Elevação', target: '--', actual: '--', iconBg: '#3D3520', iconColor: '#FFB800', barColor: '#FFB800', progress: 0 },
    ];

    // Get analysis content from feedback
    const strength = feedback?.strengths?.[0];
    const improvement = feedback?.improvements?.[0];

    // Loading state
    const showLoading = isLoading || latestActivityLoading;

    // Get score title from feedback
    const getScoreTitle = () => {
        if (feedback?.hero_message) return feedback.hero_message;
        if (feedback?.hero_tone === 'celebration') return 'Execução Perfeita!';
        if (feedback?.hero_tone === 'encouragement') return 'Bom Trabalho!';
        if (feedback?.hero_tone === 'improvement') return 'Continue Evoluindo!';
        if (feedback?.hero_tone === 'caution') return 'Atenção Necessária';
        return 'Análise do Treino';
    };

    // Format activity date for subtitle
    const getActivitySubtitle = () => {
        if (!activity) return 'Carregando...';
        const activityName = activity.name || 'Treino';
        const date = new Date(activity.start_date);
        const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        return `${activityName} - ${isToday ? 'Hoje' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${timeStr}`;
    };

    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                        <BackIcon size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerSubtitle}>Relatório</Text>
                        <Text style={styles.headerTitle}>Treinador</Text>
                    </View>
                    <TouchableOpacity style={styles.shareButton}>
                        <ShareIcon size={24} color="#00D4FF" />
                    </TouchableOpacity>
                </View>

                {/* Score Section */}
                <View style={styles.scoreSection}>
                    <CircularScore percentage={100} size={120} />
                    <Text style={styles.scoreTitle}>{showLoading ? 'Carregando...' : getScoreTitle()}</Text>
                    <Text style={styles.scoreSubtitle}>{showLoading ? '...' : getActivitySubtitle()}</Text>
                </View>

                {/* Métricas Detalhadas - Header FORA do card */}
                <View style={styles.metricsHeaderOuter}>
                    <Text style={styles.metricsTitle}>Métricas Detalhadas</Text>
                    <View style={styles.metricsBadge}>
                        <Text style={styles.metricsBadgeText}>Planejado vs Real</Text>
                    </View>
                </View>

                {/* Métricas Detalhadas - Card */}
                <View style={styles.metricsCard}>
                    {/* Table Header */}
                    <View style={styles.tableHeader}>
                        <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Métrica</Text>
                        <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Meta</Text>
                        <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Executado</Text>
                    </View>

                    {/* Table Rows */}
                    {metrics.map((metric, index) => (
                        <View key={index} style={styles.tableRow}>
                            <View style={[styles.tableCellMetric]}>
                                <View style={[styles.metricIconContainer, { backgroundColor: metric.iconBg }]}>
                                    <metric.icon size={20} color={metric.iconColor} />
                                </View>
                                <Text style={styles.metricLabel}>{metric.label}</Text>
                            </View>
                            <Text style={[styles.tableCellText, styles.metricTarget]}>{metric.target}</Text>
                            <View style={styles.executedColumn}>
                                <Text style={[styles.metricActualValue, { color: metric.barColor }]}>{metric.actual}</Text>
                                <View style={styles.progressBarContainer}>
                                    <View style={[styles.progressBar, { width: `${metric.progress}%`, backgroundColor: metric.barColor }]} />
                                </View>
                            </View>
                        </View>
                    ))}

                    {/* Strava compliance branding - only when activity exists */}
                    {activity && (
                        <PoweredByStrava
                            width={76}
                            style={{ marginTop: 16 }}
                        />
                    )}
                </View>

                {/* Análise Inteligente */}
                <View style={styles.analysisSection}>
                    <View style={styles.analysisTitleRow}>
                        <Text style={styles.analysisTitle}>Análise Inteligente</Text>
                        <TrophyIcon size={20} color="#00D4FF" />
                    </View>

                    {/* Ponto Forte (Strengths) */}
                    {strength ? (
                        <View style={[styles.analysisCard, styles.analysisCardGreen]}>
                            <View style={styles.analysisCardIcon}>
                                <ThumbUpIcon size={24} color="#32CD32" />
                            </View>
                            <View style={styles.analysisCardContent}>
                                <Text style={styles.analysisCardTitle}>{strength.title}</Text>
                                <Text style={styles.analysisCardText}>
                                    {strength.description}
                                </Text>
                            </View>
                        </View>
                    ) : (
                        <View style={[styles.analysisCard, styles.analysisCardGreen]}>
                            <View style={styles.analysisCardIcon}>
                                <ThumbUpIcon size={24} color="#32CD32" />
                            </View>
                            <View style={styles.analysisCardContent}>
                                <Text style={styles.analysisCardTitle}>Ponto Forte</Text>
                                <Text style={styles.analysisCardText}>
                                    Complete um treino para receber análise personalizada.
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Área de Melhoria (Improvements) */}
                    {improvement ? (
                        <View style={[styles.analysisCard, styles.analysisCardYellow]}>
                            <View style={styles.analysisCardIcon}>
                                <AlertIcon size={24} color="#FFD700" />
                            </View>
                            <View style={styles.analysisCardContent}>
                                <Text style={styles.analysisCardTitle}>{improvement.title}</Text>
                                <Text style={styles.analysisCardText}>
                                    {improvement.description}
                                </Text>
                                {improvement.tip && (
                                    <Text style={styles.analysisCardText}>
                                        <Text style={styles.analysisHighlightOrange}>Dica: </Text>
                                        {improvement.tip}
                                    </Text>
                                )}
                            </View>
                        </View>
                    ) : (
                        <View style={[styles.analysisCard, styles.analysisCardYellow]}>
                            <View style={styles.analysisCardIcon}>
                                <AlertIcon size={24} color="#FFD700" />
                            </View>
                            <View style={styles.analysisCardContent}>
                                <Text style={styles.analysisCardTitle}>Área de Melhoria</Text>
                                <Text style={styles.analysisCardText}>
                                    Aguardando dados do treino para análise.
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* VO2 Max Unified Card */}
                    <View style={styles.vo2CardUnified}>
                        <View style={styles.vo2UnifiedHeader}>
                            <HeartbeatIcon size={24} color="#00D4FF" />
                            <Text style={styles.vo2UnifiedTitle}>VO² Máximo Estimado</Text>
                        </View>

                        <View style={styles.vo2UnifiedBody}>
                            <View style={styles.vo2ValueContainer}>
                                <Text style={styles.vo2ValueLarge}>
                                    {latestActivity?.vo2_max?.is_valid
                                        ? latestActivity.vo2_max.current_value.toFixed(1)
                                        : '--'}
                                </Text>
                                <Text style={styles.vo2Unit}>ml/kg/min</Text>
                            </View>

                            {latestActivity?.vo2_max?.is_valid && (
                                <View style={[
                                    styles.vo2TrendBadge,
                                    latestActivity.vo2_max.is_interrupted && styles.vo2TrendBadgeNeutral,
                                    !latestActivity.vo2_max.is_interrupted && latestActivity.vo2_max.trend_percent > 0 && styles.vo2TrendBadgePositive,
                                    !latestActivity.vo2_max.is_interrupted && latestActivity.vo2_max.trend_percent < 0 && styles.vo2TrendBadgeNegative,
                                ]}>
                                    <TrendUpIcon
                                        size={16}
                                        color={
                                            latestActivity.vo2_max.is_interrupted ? '#9CA3AF' :
                                                latestActivity.vo2_max.trend_percent >= 0 ? '#32CD32' : '#FF6B6B'
                                        }
                                    />
                                    <Text style={[
                                        styles.vo2TrendText,
                                        {
                                            color: latestActivity.vo2_max.is_interrupted ? '#9CA3AF' :
                                                latestActivity.vo2_max.trend_percent >= 0 ? '#32CD32' : '#FF6B6B'
                                        }
                                    ]}>
                                        {latestActivity.vo2_max.is_interrupted
                                            ? '0.0%'
                                            : `${latestActivity.vo2_max.trend_percent >= 0 ? '+' : ''}${latestActivity.vo2_max.trend_percent.toFixed(1)}%`
                                        }
                                    </Text>
                                </View>
                            )}
                        </View>

                        {latestActivity?.vo2_max?.message && (
                            <Text style={styles.vo2Message}>{latestActivity.vo2_max.message}</Text>
                        )}

                        {!latestActivity?.vo2_max?.is_valid && (
                            <Text style={styles.vo2Message}>Dados insuficientes para cálculo</Text>
                        )}

                        {/* Strava compliance branding - only when activity exists */}
                        {latestActivity && (
                            <PoweredByStrava width={76} style={{ marginTop: 12 }} />
                        )}
                    </View>
                </View>

                {/* Conquista */}
                {latestActivity?.conquest ? (
                    latestActivity.conquest.goal_met ? (
                        // Goal Met - Show success
                        <View style={[
                            styles.conquestCard,
                            Platform.OS === 'web' && {
                                // @ts-ignore - web only gradient
                                backgroundImage: 'linear-gradient(90deg, rgba(28,28,46,1) 0%, rgba(28,28,46,1) 50%, rgba(255,196,0,0.2) 100%)',
                            }
                        ]}>
                            <View style={styles.conquestHeader}>
                                <ConquestaTrophyIcon size={35} />
                                <Text style={styles.conquestLabel}>CONQUISTA</Text>
                            </View>
                            <View style={styles.conquestContent}>
                                <View style={styles.conquestInfo}>
                                    <Text style={styles.conquestTitle}>Meta Alcançada!</Text>
                                    <Text style={styles.conquestName}>
                                        {latestActivity.conquest.executed_distance_km.toFixed(1)} km de {latestActivity.conquest.planned_distance_km} km
                                    </Text>
                                    <Text style={styles.conquestXp}>+{latestActivity.conquest.xp_earned} XP</Text>
                                </View>
                                <ConquestaMedalIcon size={64} />
                            </View>
                        </View>
                    ) : latestActivity.conquest.has_linked_workout ? (
                        // Goal Not Met - Show warning
                        <View style={[
                            styles.conquestCard,
                            styles.conquestCardFailed,
                            Platform.OS === 'web' && {
                                // @ts-ignore - web only gradient
                                backgroundImage: 'linear-gradient(90deg, rgba(28,28,46,1) 0%, rgba(28,28,46,1) 50%, rgba(139,69,69,0.2) 100%)',
                            }
                        ]}>
                            <View style={styles.conquestHeader}>
                                <AlertIcon size={35} color="#FF6B6B" />
                                <Text style={[styles.conquestLabel, { color: '#FF6B6B' }]}>META NÃO BATIDA</Text>
                            </View>
                            <View style={styles.conquestContent}>
                                <View style={styles.conquestInfo}>
                                    <Text style={styles.conquestTitle}>Objetivo Não Atingido</Text>
                                    <Text style={styles.conquestName}>
                                        {latestActivity.conquest.executed_distance_km.toFixed(1)} km de {latestActivity.conquest.planned_distance_km} km planejados
                                    </Text>
                                    <Text style={[styles.conquestXp, { color: '#FF6B6B' }]}>Nenhum XP contabilizado</Text>
                                </View>
                            </View>
                        </View>
                    ) : (
                        // No linked workout - Activity without plan
                        <View style={[styles.conquestCard]}>
                            <View style={styles.conquestHeader}>
                                <ConquestaTrophyIcon size={35} />
                                <Text style={styles.conquestLabel}>ATIVIDADE LIVRE</Text>
                            </View>
                            <View style={styles.conquestContent}>
                                <View style={styles.conquestInfo}>
                                    <Text style={styles.conquestTitle}>Corrida Avulsa</Text>
                                    <Text style={styles.conquestName}>
                                        {latestActivity.conquest.executed_distance_km.toFixed(1)} km percorridos
                                    </Text>
                                    <Text style={styles.conquestXp}>+{latestActivity.conquest.xp_earned} XP</Text>
                                </View>
                            </View>
                        </View>
                    )
                ) : (
                    // Default/Loading state
                    <View style={[styles.conquestCard]}>
                        <View style={styles.conquestHeader}>
                            <ConquestaTrophyIcon size={35} />
                            <Text style={styles.conquestLabel}>CONQUISTA</Text>
                        </View>
                        <View style={styles.conquestContent}>
                            <View style={styles.conquestInfo}>
                                <Text style={styles.conquestTitle}>Carregando...</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Dica */}
                <View style={styles.tipCard}>
                    <AlarmIcon size={23} />
                    <Text style={styles.tipText}>
                        Para maior precisão nas zonas de esforço, considere parear um <Text style={styles.tipBold}>monitor cardíaco</Text> externo.
                    </Text>
                </View>

                {/* Concluir Button */}
                <TouchableOpacity
                    style={styles.concludeButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.concludeButtonText}>Concluir</Text>
                </TouchableOpacity>

                <View style={styles.spacer} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0E0E1F',
    },
    scrollView: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        alignItems: 'center',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#00D4FF',
        fontWeight: '500',
    },
    headerTitle: {
        fontSize: 18,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    shareButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scoreSection: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        marginTop: 30,
        marginBottom: 48,
    },
    scoreTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        marginTop: 40,
        textAlign: 'center',
        maxWidth: screenWidth - 48,
        flexShrink: 1,
    },
    scoreSubtitle: {
        fontSize: 14,
        color: 'rgba(235,235,245,0.6)',
        marginTop: 2,
        marginBottom: 8,
        textAlign: 'center',
    },
    metricsHeaderOuter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginHorizontal: spacing.lg,
        marginBottom: spacing.md,
    },
    metricsCard: {
        backgroundColor: '#1C1C2E',
        marginHorizontal: spacing.lg,
        borderRadius: 16,
        padding: spacing.lg,
        paddingTop: spacing.md,
        marginBottom: 24,
    },
    metricsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    metricsTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    metricsBadge: {
        backgroundColor: 'rgba(0,212,255,0.15)',
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: 8,
    },
    metricsBadgeText: {
        fontSize: 11,
        color: 'rgba(235,235,245,0.6)',
    },
    tableHeader: {
        flexDirection: 'row',
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    tableHeaderText: {
        fontSize: 12,
        color: 'rgba(235,235,245,0.6)',
        fontWeight: '500',
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    tableCellMetric: {
        flex: 1.5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    tableCellText: {
        flex: 1,
        fontSize: 14,
        textAlign: 'center',
    },
    metricIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,212,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    metricLabel: {
        fontSize: 14,
        color: '#FFFFFF',
        fontWeight: '500',
    },
    metricTarget: {
        color: 'rgba(235,235,245,0.6)',
        textAlign: 'center',
    },
    metricActual: {
        color: '#00D4FF',
        fontWeight: '600',
        textAlign: 'right',
    },
    executedColumn: {
        flex: 1,
        alignItems: 'flex-end',
    },
    metricActualValue: {
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'right',
    },
    progressBarContainer: {
        width: 60,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        marginTop: 6,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        borderRadius: 2,
    },
    analysisSection: {
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
    },
    analysisTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    analysisTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    analysisCard: {
        flexDirection: 'row',
        borderRadius: 16,
        padding: spacing.lg,
        marginBottom: 24,
        borderWidth: 2,
    },
    analysisCardGreen: {
        borderColor: '#32CD32',
        backgroundColor: 'rgba(50, 205, 50, 0.2)',
    },
    analysisCardYellow: {
        borderColor: '#B8860B',
        backgroundColor: 'rgba(184, 134, 11, 0.2)',
    },
    analysisCardIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    analysisCardContent: {
        flex: 1,
    },
    analysisCardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    analysisCardText: {
        fontSize: 13,
        color: 'rgba(235,235,245,0.6)',
        lineHeight: 18,
    },
    analysisHighlight: {
        color: '#00D4FF',
        fontWeight: '600',
    },
    analysisHighlightOrange: {
        color: '#FFA500',
        fontWeight: '600',
    },
    vo2Row: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    vo2Card: {
        flex: 1,
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        padding: spacing.lg,
        paddingBottom: spacing.md,
    },
    vo2Header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: spacing.xs,
    },
    vo2HeaderNew: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: spacing.sm,
    },
    vo2Change: {
        fontSize: 12,
        color: '#32CD32',
    },
    vo2ChangeText: {
        fontSize: 11,
        color: '#32CD32',
    },
    vo2Value: {
        fontSize: 28,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    vo2Label: {
        fontSize: 10,
        color: 'rgba(235,235,245,0.6)',
        marginTop: 4,
    },
    // Unified VO2 Max Card Styles
    vo2CardUnified: {
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.3)',
    },
    vo2UnifiedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    vo2UnifiedTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#00D4FF',
    },
    vo2UnifiedBody: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    vo2ValueContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: spacing.xs,
    },
    vo2ValueLarge: {
        fontSize: 42,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    vo2Unit: {
        fontSize: 14,
        color: 'rgba(235,235,245,0.6)',
        marginLeft: 4,
    },
    vo2TrendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(50,205,50,0.15)',
    },
    vo2TrendBadgePositive: {
        backgroundColor: 'rgba(50,205,50,0.15)',
    },
    vo2TrendBadgeNegative: {
        backgroundColor: 'rgba(255,107,107,0.15)',
    },
    vo2TrendBadgeNeutral: {
        backgroundColor: 'rgba(156,163,175,0.15)',
    },
    vo2TrendText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#32CD32',
    },
    vo2Message: {
        fontSize: 12,
        color: 'rgba(235,235,245,0.5)',
        marginTop: spacing.sm,
        fontStyle: 'italic',
    },
    conquestCard: {
        marginHorizontal: spacing.lg,
        borderRadius: 16,
        padding: spacing.lg,
        marginBottom: 24,
        backgroundColor: '#1C1C2E',
        borderWidth: 0,
        overflow: 'hidden',
    },
    conquestCardFailed: {
        borderWidth: 1,
        borderColor: 'rgba(255,107,107,0.3)',
    },
    conquestHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    conquestLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFC400',
        letterSpacing: 1,
    },
    conquestContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    conquestInfo: {
        flex: 1,
    },
    conquestTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    conquestName: {
        fontSize: 14,
        color: 'rgba(235,235,245,0.6)',
        marginTop: 2,
    },
    conquestXp: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFD700',
        marginTop: spacing.sm,
    },
    conquestIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,215,0,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    tipCard: {
        flexDirection: 'row',
        backgroundColor: '#1C1C2E',
        marginHorizontal: spacing.lg,
        borderRadius: 16,
        padding: spacing.lg,
        gap: spacing.md,
        marginBottom: spacing.xl,
        alignItems: 'flex-start',
    },
    tipText: {
        flex: 1,
        fontSize: 13,
        color: 'rgba(235,235,245,0.8)',
        lineHeight: 18,
    },
    tipBold: {
        fontWeight: '700',
        color: '#FFFFFF',
    },
    concludeButton: {
        backgroundColor: '#00D4FF',
        marginHorizontal: spacing.lg,
        paddingVertical: 16,
        borderRadius: 15,
        alignItems: 'center',
    },
    concludeButtonText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#EBEBF5',
    },
    spacer: {
        height: 40,
    },
});
