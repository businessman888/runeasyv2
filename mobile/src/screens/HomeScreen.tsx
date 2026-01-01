import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Image,
    Platform,
    Linking,
    Alert,
} from 'react-native';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useAuthStore, useGamificationStore, useTrainingStore, useFeedbackStore, useStatsStore, useNotificationStore } from '../stores';
import { CircularProgress } from '../components/CircularProgress';
import { Skeleton, SkeletonCircle, SkeletonText } from '../components/Skeleton';

// Fire icon SVG component for streak banner
function FireIcon({ size = 24, color = '#FFC400' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M12.0001 23C10.4972 22.9999 9.0291 22.5483 7.786 21.7037C6.5429 20.8592 5.5822 19.6606 5.02844 18.2635C4.47468 16.8664 4.35342 15.3352 4.68038 13.8683C5.00733 12.4015 5.76742 11.0667 6.86209 10.037C8.20409 8.774 11.5001 6.5 11.0001 1.5C17.0001 5.5 20.0001 9.5 14.0001 15.5C15.0001 15.5 16.5001 15.5 19.0001 13.03C19.2701 13.803 19.5001 14.634 19.5001 15.5C19.5001 17.4891 18.7099 19.3968 17.3034 20.8033C15.8969 22.2098 13.9892 23 12.0001 23Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>🔥</Text>;
}

// Running icon for workout card header
function RunningIcon({ size = 30, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 30 30" fill="none">
                <path d="M19.0625 8.125C19.8084 8.125 20.5238 7.82868 21.0512 7.30124C21.5787 6.77379 21.875 6.05842 21.875 5.3125C21.875 4.56658 21.5787 3.85121 21.0512 3.32376C20.5238 2.79632 19.8084 2.5 19.0625 2.5C18.3166 2.5 17.6012 2.79632 17.0737 3.32376C16.5463 3.85121 16.25 4.56658 16.25 5.3125C16.25 6.05842 16.5463 6.77379 17.0737 7.30124C17.6012 7.82868 18.3166 8.125 19.0625 8.125ZM13.4125 10.8012C12.6331 10.995 12.1012 11.2863 11.6719 11.6475C11.0281 12.19 10.5081 12.9725 9.80561 14.2025C9.64109 14.4903 9.36897 14.701 9.0491 14.7882C8.72923 14.8755 8.38782 14.832 8.09998 14.6675C7.81214 14.503 7.60144 14.2309 7.51424 13.911C7.42703 13.5911 7.47046 13.2497 7.63498 12.9619C8.33436 11.7388 9.04123 10.5944 10.0619 9.73562C11.1269 8.83812 12.4306 8.33063 14.1887 8.135C14.9237 8.05375 15.7325 8.07 16.4906 8.40812C17.2862 8.76375 17.8675 9.40062 18.2637 10.2519C18.7975 11.3975 19.1944 12.0794 19.5119 12.475C19.665 12.6644 19.7719 12.7525 19.8325 12.7919C19.8806 12.8231 19.9012 12.8256 19.9087 12.8269C19.9631 12.8331 20.14 12.8269 20.6575 12.5975C20.8831 12.4975 21.1294 12.3775 21.4306 12.2306L21.5025 12.1956C21.8709 12.0139 22.2427 11.8388 22.6175 11.6706C22.9201 11.5378 23.263 11.5302 23.5713 11.6495C23.8795 11.7688 24.1279 12.0054 24.2622 12.3074C24.3964 12.6094 24.4056 12.9523 24.2877 13.261C24.1699 13.5698 23.9345 13.8193 23.6331 13.955C23.2857 14.1109 22.9413 14.2732 22.6 14.4419L22.5181 14.4819C22.23 14.6225 21.94 14.7644 21.6681 14.8844C21.1056 15.1331 20.3869 15.4031 19.6075 15.3088C18.785 15.2087 18.1512 14.7444 17.6294 14.1213L15.9212 17.4169L18.2837 20.4906C18.4246 20.6741 18.5118 20.893 18.5356 21.1231L19.0556 26.1206C19.0754 26.2853 19.0623 26.4522 19.0169 26.6117C18.9716 26.7713 18.8949 26.9202 18.7915 27.0498C18.688 27.1794 18.5598 27.2871 18.4143 27.3667C18.2688 27.4463 18.1089 27.4961 17.9439 27.5132C17.779 27.5304 17.6123 27.5146 17.4535 27.4667C17.2947 27.4188 17.1471 27.3398 17.0192 27.2342C16.8912 27.1287 16.7856 26.9988 16.7083 26.852C16.6311 26.7052 16.5839 26.5446 16.5694 26.3794L16.0856 21.7337L14.6506 19.8662L14.6381 19.8894L14.5856 19.7819L11.9344 16.3319C11.804 16.1623 11.7194 15.9621 11.6885 15.7505C11.6577 15.5389 11.6816 15.3229 11.7581 15.1231L13.4125 10.8012Z" fill={color} />
                <path d="M11.52 18.1294L10.6 20.6044L6.97496 20.3169C6.81015 20.3016 6.64394 20.3192 6.48597 20.3686C6.32801 20.4181 6.18144 20.4984 6.05477 20.6049C5.9281 20.7115 5.82385 20.8421 5.74807 20.9893C5.67229 21.1364 5.62649 21.2972 5.61333 21.4622C5.60017 21.6272 5.61991 21.7931 5.67141 21.9504C5.7229 22.1077 5.80513 22.2532 5.91331 22.3785C6.02149 22.5038 6.15347 22.6063 6.3016 22.6802C6.44973 22.7541 6.61105 22.7978 6.77621 22.8088L11.3437 23.1713C11.6148 23.1928 11.8855 23.1254 12.1148 22.9793C12.3441 22.8331 12.5195 22.6161 12.6143 22.3613L13.3175 20.4688L11.52 18.1294Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏃</Text>;
}

// Distance icon
function DistanceIcon({ size = 18, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
                <path d="M13.5 12C14.0967 12 14.669 12.2371 15.091 12.659C15.5129 13.081 15.75 13.6533 15.75 14.25C15.75 14.8467 15.5129 15.419 15.091 15.841C14.669 16.2629 14.0967 16.5 13.5 16.5C12.9033 16.5 12.331 16.2629 11.909 15.841C11.4871 15.419 11.25 14.8467 11.25 14.25C11.25 13.6533 11.4871 13.081 11.909 12.659C12.331 12.2371 12.9033 12 13.5 12ZM11.625 3C12.5201 3 13.3785 3.35558 14.0115 3.98851C14.6444 4.62145 15 5.47989 15 6.375C15 7.27011 14.6444 8.12855 14.0115 8.76149C13.3785 9.39442 12.5201 9.75 11.625 9.75H6.375C5.87772 9.75 5.40081 9.94754 5.04917 10.2992C4.69754 10.6508 4.5 11.1277 4.5 11.625C4.5 12.1223 4.69754 12.5992 5.04917 12.9508C5.40081 13.3025 5.87772 13.5 6.375 13.5H9.75C9.94891 13.5 10.1397 13.579 10.2803 13.7197C10.421 13.8603 10.5 14.0511 10.5 14.25C10.5 14.4489 10.421 14.6397 10.2803 14.7803C10.1397 14.921 9.94891 15 9.75 15H6.375C5.47989 15 4.62145 14.6444 3.98851 14.0115C3.35558 13.3785 3 12.5201 3 11.625C3 10.7299 3.35558 9.87145 3.98851 9.23851C4.62145 8.60558 5.47989 8.25 6.375 8.25H11.625C12.1223 8.25 12.5992 8.05246 12.9508 7.70083C13.3025 7.34919 13.5 6.87228 13.5 6.375C13.5 5.87772 13.3025 5.40081 12.9508 5.04917C12.5992 4.69754 12.1223 4.5 11.625 4.5H8.25C8.05109 4.5 7.86032 4.42098 7.71967 4.28033C7.57902 4.13968 7.5 3.94891 7.5 3.75C7.5 3.55109 7.57902 3.36032 7.71967 3.21967C7.86032 3.07902 8.05109 3 8.25 3H11.625ZM4.5 1.5C5.09674 1.5 5.66903 1.73705 6.09099 2.15901C6.51295 2.58097 6.75 3.15326 6.75 3.75C6.75 4.34674 6.51295 4.91903 6.09099 5.34099C5.66903 5.76295 5.09674 6 4.5 6C3.90326 6 3.33097 5.76295 2.90901 5.34099C2.48705 4.91903 2.25 4.34674 2.25 3.75C2.25 3.15326 2.48705 2.58097 2.90901 2.15901C3.33097 1.73705 3.90326 1.5 4.5 1.5Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>📏</Text>;
}

// Pace/Stopwatch icon
function PaceIcon({ size = 18, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
                <path d="M9 16.5C12.3137 16.5 15 13.8137 15 10.5C15 7.18629 12.3137 4.5 9 4.5C5.68629 4.5 3 7.18629 3 10.5C3 13.8137 5.68629 16.5 9 16.5Z" stroke={color} strokeWidth="2" />
                <path d="M10.5 1.5H7.5M9 1.5V4.5M13.125 6L14.25 4.875M9 8.25V10.5H6.75" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>⏱️</Text>;
}

// Calendar icon for workout time
function CalendarSmallIcon({ size = 18, color = 'rgba(235, 235, 245, 0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
                <path d="M1.5 6.75C1.5 5.3355 1.5 4.629 1.9395 4.1895C2.379 3.75 3.0855 3.75 4.5 3.75H13.5C14.9145 3.75 15.621 3.75 16.0605 4.1895C16.5 4.629 16.5 5.3355 16.5 6.75C16.5 7.10325 16.5 7.28025 16.3905 7.3905C16.2802 7.5 16.1025 7.5 15.75 7.5H2.25C1.89675 7.5 1.71975 7.5 1.6095 7.3905C1.5 7.28025 1.5 7.1025 1.5 6.75ZM1.5 13.5C1.5 14.9145 1.5 15.621 1.9395 16.0605C2.379 16.5 3.0855 16.5 4.5 16.5H13.5C14.9145 16.5 15.621 16.5 16.0605 16.0605C16.5 15.621 16.5 14.9145 16.5 13.5V9.75C16.5 9.39675 16.5 9.21975 16.3905 9.1095C16.2802 9 16.1025 9 15.75 9H2.25C1.89675 9 1.71975 9 1.6095 9.1095C1.5 9.21975 1.5 9.3975 1.5 9.75V13.5Z" fill={color} />
                <path d="M5.25 2.25V4.5M12.75 2.25V4.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>📅</Text>;
}

// Shoe icon for start training button
function ShoeIcon({ size = 24, color = '#0E0E1F' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M8.97591 3.56001C8.93114 3.38675 8.8259 3.2352 8.67919 3.13273C8.53247 3.03027 8.35396 2.98364 8.17588 3.00127C7.99779 3.0189 7.83188 3.09962 7.70811 3.22886C7.58433 3.35809 7.51084 3.52733 7.50091 3.70601C5.68091 4.30101 4.54991 5.22301 3.87691 6.29501C3.16891 7.42101 3.02791 8.61901 3.00391 9.54101L3.00191 9.63401L2.49491 10.267C2.30077 10.5096 2.15898 10.7898 2.0785 11.09C1.99801 11.3901 1.98056 11.7036 2.02726 12.0109C2.07395 12.3181 2.18377 12.6123 2.34979 12.8749C2.51582 13.1376 2.73445 13.363 2.99191 13.537L12.0589 19.668C13.341 20.5349 14.8532 20.9982 16.4009 20.998H18.6089C19.0937 20.998 19.5729 20.8941 20.0142 20.6933C20.4555 20.4924 20.8486 20.1993 21.167 19.8337C21.4854 19.4681 21.7217 19.0385 21.8601 18.5738C21.9984 18.1092 22.0355 17.6202 21.9689 17.14C21.7309 15.48 20.2959 14.33 19.0169 13.713C18.6019 13.513 18.2589 13.253 18.0309 12.917L15.4479 8.47301C15.6272 8.4228 15.7815 8.30768 15.8806 8.15005C15.9797 7.99241 16.0167 7.80352 15.9843 7.62015C15.9518 7.43678 15.8523 7.27203 15.7051 7.15796C15.5579 7.04389 15.3736 6.98866 15.1879 7.00301C14.8572 7.02834 14.5292 7.03434 14.2039 7.02101C11.8439 6.92301 9.83891 5.82101 9.12991 4.03401C9.06877 3.87936 9.01734 3.72106 8.97591 3.56001ZM6.39291 5.86001L7.97991 8.60501C8.07835 8.77566 8.14222 8.96403 8.16786 9.15936C8.1935 9.35469 8.1804 9.55316 8.12933 9.74343C8.07826 9.93371 7.9902 10.1121 7.87019 10.2683C7.75019 10.4245 7.60058 10.5556 7.42991 10.654L7.04491 10.876L4.52491 9.17601C4.57691 8.47901 4.73191 7.75501 5.14791 7.09201C5.41391 6.66801 5.80591 6.24201 6.39491 5.86001M8.43691 11.814L11.2299 10.201C11.4006 10.1026 11.5889 10.0387 11.7843 10.0131C11.9796 9.98742 12.1781 10.0005 12.3683 10.0516C12.5586 10.1027 12.737 10.1907 12.8932 10.3107C13.0494 10.4307 13.1805 10.5803 13.2789 10.751L13.8029 11.658C13.9014 11.8287 13.9652 12.017 13.9909 12.2124C14.0165 12.4077 14.0034 12.6062 13.9523 12.7964C13.9013 12.9867 13.8132 13.1651 13.6932 13.3213C13.5732 13.4775 13.4236 13.6086 13.2529 13.707L12.1699 14.333L8.43691 11.814ZM16.3709 17.997H20.4629C20.3736 18.4218 20.1407 18.803 19.8034 19.0763C19.4661 19.3497 19.045 19.4986 18.6109 19.498H16.4029C15.1551 19.4982 13.9357 19.1248 12.9019 18.426L3.83391 12.294C3.74806 12.236 3.67516 12.1609 3.61978 12.0734C3.56441 11.9858 3.52777 11.8878 3.51217 11.7854C3.49658 11.683 3.50237 11.5784 3.52917 11.4784C3.55597 11.3783 3.60321 11.2849 3.66791 11.204L4.08291 10.686L13.7149 17.184C14.4995 17.7136 15.4243 17.9967 16.3709 17.997Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>👟</Text>;
}

// Binoculars icon for AI Analysis card header
function BinocularsIcon({ size = 35, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 35 35" fill="none">
                <path d="M12.9602 9.84082C12.7225 9.84082 12.4688 9.86415 12.2223 9.92395C11.9715 9.98374 11.3736 10.1646 11.0002 10.7435L10.9798 10.7727L10.0946 12.3039C9.64688 12.6029 9.31584 12.9748 9.08397 13.3496L9.06355 13.3787L5.31272 20.16C5.16271 20.3904 5.02918 20.6311 4.91313 20.8804L4.90438 20.895C4.55413 21.6601 4.37354 22.4919 4.37501 23.3333C4.37501 24.8804 4.98959 26.3641 6.08355 27.4581C7.17751 28.5521 8.66125 29.1667 10.2083 29.1667C11.7554 29.1667 13.2392 28.5521 14.3331 27.4581C15.4271 26.3641 16.0417 24.8804 16.0417 23.3333V21.875H18.9583V23.3333C18.9585 24.2051 19.154 25.0658 19.5306 25.8521C19.9072 26.6384 20.4552 27.3303 21.1344 27.8768C21.8136 28.4234 22.6066 28.8108 23.4552 29.0106C24.3039 29.2103 25.1865 29.2173 26.0381 29.031C26.8898 28.8447 27.6889 28.4699 28.3766 27.9341C29.0644 27.3983 29.6233 26.7152 30.0122 25.935C30.4012 25.1548 30.6103 24.2973 30.6243 23.4256C30.6382 22.5539 30.4566 21.6902 30.0927 20.8979L30.0869 20.8804C29.9708 20.6311 29.8373 20.3904 29.6873 20.16L25.9365 13.3787L25.916 13.3496C25.6595 12.9318 25.3146 12.5754 24.9054 12.3054L24.0202 10.7727L23.9998 10.7435C23.6265 10.1646 23.0271 9.9852 22.7777 9.92395C22.4606 9.85016 22.1341 9.82508 21.8094 9.84957C21.4681 9.86672 21.1324 9.94372 20.8177 10.0771C20.5494 10.1952 19.8873 10.5539 19.7181 11.3735L19.7079 11.4275L19.5038 13.0317C19.1829 13.4444 18.9583 13.965 18.9583 14.5833V16.0417H16.0417V14.5833C16.0417 13.965 15.8171 13.4444 15.4977 13.0317L15.2936 11.4275L15.2819 11.3735C15.1127 10.5539 14.4506 10.1952 14.1823 10.0771C13.8676 9.94372 13.532 9.86672 13.1906 9.84957C13.114 9.84362 13.0371 9.8407 12.9602 9.84082ZM10.2083 20.4167C10.8357 20.417 11.4463 20.6196 11.9494 20.9945C12.4525 21.3693 12.8213 21.8964 13.0011 22.4975C13.1809 23.0986 13.1621 23.7416 12.9475 24.3311C12.7328 24.9207 12.3338 25.4253 11.8096 25.7701C11.2855 26.1149 10.6641 26.2814 10.0378 26.2451C9.41142 26.2087 8.8135 25.9714 8.33275 25.5683C7.852 25.1651 7.51405 24.6177 7.36906 24.0073C7.22408 23.3969 7.27979 22.756 7.52793 22.1798L7.80501 21.681C8.33001 20.9183 9.21084 20.4167 10.2083 20.4167ZM24.7917 20.4167C25.7892 20.4167 26.67 20.9183 27.195 21.681L27.4721 22.1798C27.7202 22.756 27.7759 23.3969 27.631 24.0073C27.486 24.6177 27.148 25.1651 26.6673 25.5683C26.1865 25.9714 25.5886 26.2087 24.9623 26.2451C24.3359 26.2814 23.7145 26.1149 23.1904 25.7701C22.6662 25.4253 22.2672 24.9207 22.0526 24.3311C21.8379 23.7416 21.8191 23.0986 21.9989 22.4975C22.1787 21.8964 22.5475 21.3693 23.0506 20.9945C23.5537 20.6196 24.1643 20.417 24.7917 20.4167Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🔭</Text>;
}

// Trend Up icon for efficiency badge
function TrendUpIcon({ size = 20, color = '#32CD32' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={Math.round(size * 0.65)} viewBox="0 0 20 13" fill="none">
                <path d="M11.5 7.97L7.5 3.97L0 11.48L1.5 12.98L7.5 6.97L11.5 10.97L20 1.41L18.59 0L11.5 7.97Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>📈</Text>;
}

// Arrow Right icon for feedback button
function ArrowRightIcon({ size = 16, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={Math.round(size * 0.875)} viewBox="0 0 16 14" fill="none">
                <path d="M1 7H15M15 7L9 13M15 7L9 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>→</Text>;
}

// Bell icon for notification button
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

// Lock icon for AI Analysis card
function LockIcon({ size = 24, color = '#6B7280' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM15.1 8H8.9V6C8.9 4.29 10.29 2.9 12 2.9C13.71 2.9 15.1 4.29 15.1 6V8Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>🔒</Text>;
}

export function HomeScreen({ navigation }: any) {
    const { user } = useAuthStore();
    const { stats, fetchStats, isLoading: gamificationLoading } = useGamificationStore();
    const { upcomingWorkouts, fetchUpcomingWorkouts, isLoading: trainingLoading } = useTrainingStore();
    const { latestSummary, fetchLatestSummary, latestActivity, latestActivityLoading, fetchLatestActivity } = useFeedbackStore();
    const { summary, fetchSummary, isLoading: statsLoading } = useStatsStore();
    const { unreadCount, fetchUnreadCount } = useNotificationStore();
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            await Promise.all([
                fetchStats(),
                fetchUpcomingWorkouts(),
                fetchLatestSummary(),
                fetchLatestActivity(),
                fetchSummary(),
                fetchUnreadCount(),
            ]);
            setIsInitialLoading(false);
        };
        loadData();
    }, []);

    const nextWorkout = upcomingWorkouts?.[0];
    // Use real data with proper fallbacks for new users
    const currentLevel = stats?.current_level ?? 1;
    const totalPoints = stats?.total_points ?? 0;
    const pointsToNext = stats?.points_to_next_level ?? 100;
    const currentStreak = stats?.current_streak ?? 0;
    const progress = pointsToNext > 0 ? Math.min((totalPoints / pointsToNext) * 100, 100) : 0;

    // Check if user has completed any workouts (for AI card lock state)
    const hasCompletedWorkouts = (summary?.total_runs ?? 0) > 0;

    // Handle Strava deep link
    const handleStartWorkout = async () => {
        try {
            const stravaURL = 'strava://record';
            const canOpen = await Linking.canOpenURL(stravaURL);

            if (canOpen) {
                await Linking.openURL(stravaURL);
            } else {
                // Strava not installed - redirect to store
                const storeURL = Platform.OS === 'ios'
                    ? 'https://apps.apple.com/app/strava/id426826309'
                    : 'https://play.google.com/store/apps/details?id=com.strava';

                Alert.alert(
                    'Strava não instalado',
                    'Você precisa ter o Strava instalado para gravar treinos.',
                    [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                            text: 'Instalar',
                            onPress: () => Linking.openURL(storeURL)
                        }
                    ]
                );
            }
        } catch (error) {
            console.error('Error opening Strava:', error);
            Alert.alert('Erro', 'Não foi possível abrir o Strava');
        }
    };

    // Real user data from authStore
    const userName = user?.profile?.firstname
        ? `${user.profile.firstname}${user.profile.lastname ? ' ' + user.profile.lastname : ''}`
        : 'Corredor';
    const profilePic = user?.profile?.profile_pic || 'https://i.pravatar.cc/100';

    // Helper function to convert workout type to Portuguese display name
    const getWorkoutTypeName = (type: string): string => {
        const typeNames: Record<string, string> = {
            easy_run: 'Rodagem Leve',
            long_run: 'Longão',
            intervals: 'Intervalado',
            tempo: 'Tempo Run',
            recovery: 'Recuperação',
        };
        return typeNames[type] || type;
    };

    // Helper function to format workout date
    const formatWorkoutDate = (dateStr: string): string => {
        const date = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (date.getTime() === today.getTime()) {
            return 'Hoje';
        } else if (date.getTime() === tomorrow.getTime()) {
            return 'Amanhã';
        } else {
            return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
        }
    };

    // Helper function to get pace from workout instructions
    const getWorkoutPace = (workout: any): string => {
        if (workout.instructions_json && workout.instructions_json.length > 0) {
            // Find the main block or use first instruction with pace
            const mainBlock = workout.instructions_json.find((i: any) => i.type === 'main') || workout.instructions_json[0];
            if (mainBlock && mainBlock.pace_min) {
                const paceMin = Math.floor(mainBlock.pace_min);
                const paceSec = Math.round((mainBlock.pace_min - paceMin) * 60);
                return `${paceMin}:${paceSec.toString().padStart(2, '0')}`;
            }
        }
        // Default pace based on workout type
        const defaultPaces: Record<string, string> = {
            easy_run: '6:30',
            long_run: '6:00',
            intervals: '5:00',
            tempo: '5:30',
            recovery: '7:00',
        };
        return defaultPaces[workout.type] || '6:00';
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Bom dia';
        if (hour < 18) return 'Boa tarde';
        return 'Boa noite';
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {isInitialLoading ? (
                            <SkeletonCircle size={48} />
                        ) : (
                            <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                                {profilePic && profilePic.startsWith('http') ? (
                                    <Image
                                        source={{ uri: profilePic }}
                                        style={styles.profileImage}
                                    />
                                ) : (
                                    <View style={styles.profileImageInitials}>
                                        <Text style={styles.profileInitialsText}>
                                            {userName.split(' ').length > 1
                                                ? (userName.split(' ')[0][0] + userName.split(' ')[userName.split(' ').length - 1][0]).toUpperCase()
                                                : userName[0].toUpperCase()}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        )}
                        <View style={styles.headerText}>
                            <Text style={styles.greetingText}>{getGreeting()}</Text>
                            {isInitialLoading ? (
                                <SkeletonText width={120} height={20} />
                            ) : (
                                <Text style={styles.userName}>{userName}</Text>
                            )}
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.notificationButton}
                        onPress={() => navigation.navigate('Notifications')}
                    >
                        <BellIcon size={24} color="#EBEBF5" />
                        {unreadCount > 0 && (
                            <View style={styles.notificationBadge}>
                                <Text style={styles.notificationBadgeText}>
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Streak Banner - Only show when streak > 0 */}
                {currentStreak > 0 && (
                    <View style={styles.streakBanner}>
                        <FireIcon size={22} color="#FFC400" />
                        <Text style={styles.streakText}>{currentStreak} dias de sequência!</Text>
                    </View>
                )}

                {/* Level Card */}
                <View style={styles.levelCard}>
                    <View style={styles.levelHeader}>
                        <View style={styles.eliteBadge}>
                            <Text style={styles.eliteBadgeText}>Elite status</Text>
                        </View>
                        <View style={styles.diamondIcon}>
                            <Text style={styles.diamondEmoji}>💎</Text>
                        </View>
                    </View>

                    <Text style={styles.levelTitle}>Nível {currentLevel}</Text>

                    <View style={styles.levelProgressRow}>
                        <CircularProgress
                            percentage={progress}
                            size={70}
                            strokeWidth={6}
                            color={colors.primary}
                            backgroundColor={colors.border}
                        />
                        <View style={styles.levelInfo}>
                            <View style={styles.xpRow}>
                                <Text style={styles.xpLabel}>Current XP</Text>
                                <Text style={styles.xpValue}>
                                    {totalPoints}<Text style={styles.xpTotal}> / {pointsToNext}</Text>
                                </Text>
                            </View>
                            {/* Horizontal Progress Bar */}
                            <View style={styles.horizontalProgressBar}>
                                <View style={[styles.horizontalProgressFill, { width: `${progress}%` }]} />
                            </View>
                            <Text style={styles.xpNextGoal}>
                                {pointsToNext - totalPoints} XP para desbloquear plano <Text style={styles.xpBold}>Maratona</Text>
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Workout Card */}
                {nextWorkout ? (
                    <View style={styles.workoutCard}>
                        <View style={styles.workoutHeader}>
                            <View style={styles.proximoBadge}>
                                <View style={styles.proximoDot} />
                                <Text style={styles.proximoText}>Próximo</Text>
                            </View>
                            <View style={styles.runnerIcon}>
                                <RunningIcon size={30} color="#00D4FF" />
                            </View>
                        </View>

                        <Text style={styles.workoutTitle}>{getWorkoutTypeName(nextWorkout.type)}</Text>
                        <View style={styles.workoutTimeRow}>
                            <CalendarSmallIcon size={16} />
                            <Text style={styles.workoutTime}>{formatWorkoutDate(nextWorkout.scheduled_date)}</Text>
                        </View>

                        <View style={styles.workoutStats}>
                            <View style={styles.statBox}>
                                <View style={styles.statHeader}>
                                    <DistanceIcon size={18} color="#00D4FF" />
                                    <Text style={styles.statLabel}>Distância</Text>
                                </View>
                                <Text style={styles.statValue}>
                                    {nextWorkout.distance_km.toFixed(1)} <Text style={styles.statUnit}>km</Text>
                                </Text>
                            </View>
                            <View style={styles.statBox}>
                                <View style={styles.statHeader}>
                                    <PaceIcon size={18} color="#00D4FF" />
                                    <Text style={styles.statLabel}>Pace</Text>
                                </View>
                                <Text style={styles.statValue}>
                                    {getWorkoutPace(nextWorkout)} <Text style={styles.statUnit}>/km</Text>
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.startButton}
                            onPress={handleStartWorkout}
                        >
                            <ShoeIcon size={24} color="#0E0E1F" />
                            <Text style={styles.startButtonText}>Iniciar Treino</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.workoutCard}>
                        <View style={styles.lockedContent}>
                            <RunningIcon size={48} color="#6B7280" />
                            <Text style={styles.lockedText}>Nenhum treino agendado</Text>
                        </View>
                    </View>
                )}

                {/* AI Analysis Card */}
                <View style={styles.aiCard}>
                    {latestActivityLoading ? (
                        <View style={styles.aiLoadingContainer}>
                            <Skeleton width="50%" height={20} style={{ marginBottom: 8 }} />
                            <Skeleton width="30%" height={14} style={{ marginBottom: 16 }} />
                            <Skeleton width="40%" height={36} style={{ marginBottom: 8 }} />
                            <Skeleton width="60%" height={24} />
                        </View>
                    ) : latestActivity?.activity ? (
                        <>
                            <View style={styles.aiHeader}>
                                <View>
                                    <Text style={styles.aiTitle}>Análise do Treinador</Text>
                                    <Text style={styles.aiSubtitle}>
                                        {latestActivity.activity.name || 'Corrida'} - {latestActivity.activity.date_label}
                                    </Text>
                                </View>
                                <BinocularsIcon size={35} color="#00D4FF" />
                            </View>

                            <View style={styles.aiStats}>
                                <View style={styles.aiPaceSection}>
                                    <Text style={styles.aiPace}>
                                        {latestActivity.activity.formatted_pace} <Text style={styles.aiPaceUnit}>km</Text>
                                    </Text>
                                    <View style={styles.efficiencyBadge}>
                                        <TrendUpIcon size={18} color={latestActivity.efficiency_percent >= 0 ? "#32CD32" : "#FF6B6B"} />
                                        <Text style={[
                                            styles.efficiencyText,
                                            { color: latestActivity.efficiency_percent >= 0 ? "#32CD32" : "#FF6B6B" }
                                        ]}>
                                            {latestActivity.efficiency_percent >= 0 ? '+' : ''}{latestActivity.efficiency_percent}% EFICIENTE
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.miniChart}>
                                    <View style={[styles.bar, { height: 20 }]} />
                                    <View style={[styles.bar, { height: 28 }]} />
                                    <View style={[styles.bar, { height: 24 }]} />
                                    <View style={[styles.barActive, { height: 40 }]} />
                                    <View style={[styles.bar, { height: 32 }]} />
                                    <View style={[styles.barActive, { height: 48 }]} />
                                </View>
                            </View>

                            <TouchableOpacity
                                style={styles.feedbackButton}
                                onPress={() => navigation.navigate('CoachAnalysis', {
                                    activityId: latestActivity.activity?.id,
                                    feedbackId: latestActivity.feedback?.id,
                                })}
                            >
                                <Text style={styles.feedbackButtonText}>Ver feedback completo</Text>
                                <ArrowRightIcon size={18} color="#00D4FF" />
                            </TouchableOpacity>
                        </>
                    ) : hasCompletedWorkouts ? (
                        <>
                            <View style={styles.aiHeader}>
                                <View>
                                    <Text style={styles.aiTitle}>Análise do Treinador</Text>
                                    <Text style={styles.aiSubtitle}>Carregando dados...</Text>
                                </View>
                                <BinocularsIcon size={35} color="#00D4FF" />
                            </View>
                        </>
                    ) : (
                        <View style={styles.lockedContainer}>
                            <View style={styles.aiHeader}>
                                <View>
                                    <Text style={styles.aiTitle}>Análise do Treinador</Text>
                                    <Text style={styles.aiSubtitle}>Funcionalidade bloqueada</Text>
                                </View>
                                <LockIcon size={35} color="#6B7280" />
                            </View>
                            <View style={styles.lockedContent}>
                                <LockIcon size={48} color="#6B7280" />
                                <Text style={styles.lockedText}>
                                    Complete o primeiro treino para desbloquear
                                </Text>
                            </View>
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        paddingHorizontal: spacing.lg,
        paddingBottom: 120,
        gap: spacing.lg,
    },

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    profileImage: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    profileImageInitials: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: colors.primary,
        backgroundColor: '#1C1C2E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileInitialsText: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.primary,
        textTransform: 'uppercase',
    },
    headerText: {
        gap: 2,
    },
    greetingText: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    userName: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    notificationButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bellIcon: {
        fontSize: 20,
    },
    notificationBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#FF3B30',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    notificationBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold' as any,
    },

    // Streak Banner
    streakBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: 'rgba(139, 119, 42, 0.3)',
        borderWidth: 1,
        borderColor: 'rgba(179, 152, 45, 0.6)',
        borderRadius: borderRadius['2xl'],
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
    },
    streakText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFC400',
    },

    // Level Card
    levelCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.md,
    },
    levelHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    eliteBadge: {
        backgroundColor: `${colors.primary}20`,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
    },
    eliteBadgeText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold as any,
        color: colors.primary,
    },
    diamondIcon: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    diamondEmoji: {
        fontSize: 24,
    },
    levelTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    levelProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
    },
    levelInfo: {
        flex: 1,
        gap: spacing.xs,
    },
    xpRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: spacing.sm,
    },
    xpLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    xpValue: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    xpTotal: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.normal as any,
        color: colors.textMuted,
    },
    xpNextGoal: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    xpBold: {
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    horizontalProgressBar: {
        height: 6,
        backgroundColor: colors.border,
        borderRadius: 3,
        overflow: 'hidden',
    },
    horizontalProgressFill: {
        height: '100%',
        backgroundColor: colors.primary,
        borderRadius: 3,
    },

    // Workout Card
    workoutCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.md,
    },
    workoutHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    proximoBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: `${colors.primary}20`,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.full,
    },
    proximoDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    proximoText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.semibold as any,
        color: colors.primary,
    },
    runnerIcon: {
        width: 40,
        height: 40,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.highlight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    runnerEmoji: {
        fontSize: 24,
    },
    workoutTitle: {
        fontSize: typography.fontSizes['2xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    workoutTime: {
        fontSize: typography.fontSizes.sm,
        color: colors.textSecondary,
    },
    workoutTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    workoutStats: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.sm,
    },
    statBox: {
        flex: 1,
        backgroundColor: '#0E0E1F',
        borderRadius: borderRadius.xl,
        padding: spacing.md,
        gap: spacing.sm,
    },
    statHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    statIcon: {
        fontSize: 14,
    },
    statLabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
    },
    statValue: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    statUnit: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.normal as any,
        color: colors.textMuted,
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.primary,
        borderRadius: borderRadius.xl,
        paddingVertical: spacing.md,
        marginTop: spacing.sm,
        ...shadows.neon,
    },
    startIcon: {
        fontSize: 18,
    },
    startButtonText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.bold as any,
        color: '#0A0A18',
    },

    // AI Card
    aiCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius['2xl'],
        padding: spacing.lg,
        gap: spacing.lg,
    },
    aiLoadingContainer: {
        padding: spacing.md,
    },
    aiHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    aiTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    aiSubtitle: {
        fontSize: typography.fontSizes.xs,
        color: colors.textSecondary,
        marginTop: 2,
    },
    aiIcon: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    aiEmoji: {
        fontSize: 24,
    },
    aiStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    aiPaceSection: {
        gap: spacing.sm,
    },
    aiPace: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold as any,
        color: colors.text,
    },
    aiPaceUnit: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.normal as any,
        color: colors.textMuted,
    },
    efficiencyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: `${colors.success}20`,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.md,
        alignSelf: 'flex-start',
    },
    efficiencyIcon: {
        fontSize: 12,
    },
    efficiencyText: {
        fontSize: typography.fontSizes.xs,
        fontWeight: typography.fontWeights.bold as any,
        color: colors.success,
    },
    miniChart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
        height: 48,
    },
    bar: {
        width: 8,
        backgroundColor: colors.border,
        borderRadius: 4,
    },
    barActive: {
        width: 8,
        backgroundColor: colors.primary,
        borderRadius: 4,
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 0 8px rgba(0, 212, 255, 0.4)'
        } : {}),
    },
    feedbackButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.cardDark,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
    },
    feedbackButtonText: {
        fontSize: typography.fontSizes.base,
        fontWeight: typography.fontWeights.medium as any,
        color: colors.textLight,
    },
    feedbackArrow: {
        fontSize: typography.fontSizes.lg,
        color: colors.accent,
    },
    // Locked state styles
    lockedContainer: {
        width: '100%',
    },
    lockedContent: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xl,
        gap: spacing.md,
    },
    lockedText: {
        fontSize: typography.fontSizes.sm,
        color: '#6B7280',
        textAlign: 'center' as const,
    },
});
