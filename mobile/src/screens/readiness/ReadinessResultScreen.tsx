import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    ScrollView,
    Animated,
    ActivityIndicator,
    Platform,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useReadinessStore } from '../../stores/readinessStore';
import { colors, spacing, typography } from '../../theme';

const { width: screenWidth } = Dimensions.get('window');

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Calendar Icon SVG
const CalendarIcon = () => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <Path d="M22.5 5.99993C22.5 5.20428 22.1839 4.44122 21.6213 3.87861C21.0587 3.316 20.2956 2.99993 19.5 2.99993H18.75V2.27103C18.75 1.86743 18.4397 1.52103 18.0361 1.50087C17.9347 1.49598 17.8333 1.51174 17.7382 1.54717C17.6431 1.58261 17.5561 1.637 17.4826 1.70704C17.4091 1.77707 17.3506 1.8613 17.3106 1.95462C17.2706 2.04794 17.25 2.14841 17.25 2.24993V2.99993H6.75V2.27103C6.75 1.86743 6.43969 1.52103 6.03609 1.50087C5.93469 1.49598 5.83334 1.51174 5.7382 1.54717C5.64307 1.58261 5.55611 1.637 5.48261 1.70704C5.40911 1.77707 5.3506 1.8613 5.31062 1.95462C5.27063 2.04794 5.25001 2.14841 5.25 2.24993V2.99993H4.5C3.70435 2.99993 2.94129 3.316 2.37868 3.87861C1.81607 4.44122 1.5 5.20428 1.5 5.99993V6.56243C1.5 6.61216 1.51975 6.65985 1.55492 6.69501C1.59008 6.73018 1.63777 6.74993 1.6875 6.74993H22.3125C22.3622 6.74993 22.4099 6.73018 22.4451 6.69501C22.4802 6.65985 22.5 6.61216 22.5 6.56243V5.99993ZM1.5 19.4999C1.5 20.2956 1.81607 21.0586 2.37868 21.6213C2.94129 22.1839 3.70435 22.4999 4.5 22.4999H19.5C20.2956 22.4999 21.0587 22.1839 21.6213 21.6213C22.1839 21.0586 22.5 20.2956 22.5 19.4999V8.39056C22.5 8.35326 22.4852 8.31749 22.4588 8.29112C22.4324 8.26475 22.3967 8.24993 22.3594 8.24993H1.64062C1.60333 8.24993 1.56756 8.26475 1.54119 8.29112C1.51482 8.31749 1.5 8.35326 1.5 8.39056V19.4999Z" fill="#EBEBF5" />
    </Svg>
);

// Adjustment Icon SVG (sliders)
const AdjustmentIcon = () => (
    <Svg width="25" height="24" viewBox="0 0 25 24" fill="none">
        <Path d="M25 20.1638C25 20.4125 24.9012 20.6509 24.7254 20.8267C24.5496 21.0025 24.3111 21.1013 24.0625 21.1013H17.6875C17.4787 21.8799 17.0189 22.5679 16.3793 23.0585C15.7397 23.5492 14.9561 23.8151 14.15 23.8151C13.3439 23.8151 12.5603 23.5492 11.9207 23.0585C11.2811 22.5679 10.8213 21.8799 10.6125 21.1013H0.9375C0.68886 21.1013 0.450403 21.0025 0.274587 20.8267C0.0987719 20.6509 0 20.4125 0 20.1638C0 19.9152 0.0987719 19.6767 0.274587 19.5009C0.450403 19.3251 0.68886 19.2263 0.9375 19.2263H10.6125C10.8213 18.4477 11.2811 17.7598 11.9207 17.2691C12.5603 16.7784 13.3439 16.5125 14.15 16.5125C14.9561 16.5125 15.7397 16.7784 16.3793 17.2691C17.0189 17.7598 17.4787 18.4477 17.6875 19.2263H24.0625C24.3111 19.2263 24.5496 19.3251 24.7254 19.5009C24.9012 19.6767 25 19.9152 25 20.1638ZM25 3.65132C25 3.89996 24.9012 4.13841 24.7254 4.31423C24.5496 4.49004 24.3111 4.58882 24.0625 4.58882H21C20.7912 5.36741 20.3314 6.05537 19.6918 6.54603C19.0522 7.03669 18.2686 7.30263 17.4625 7.30263C16.6564 7.30263 15.8728 7.03669 15.2332 6.54603C14.5936 6.05537 14.1338 5.36741 13.925 4.58882H0.9375C0.814386 4.58882 0.692477 4.56457 0.578734 4.51745C0.464992 4.47034 0.361642 4.40128 0.274587 4.31423C0.187532 4.22717 0.118477 4.12383 0.0713629 4.01008C0.0242491 3.89634 0 3.77443 0 3.65132C0 3.5282 0.0242491 3.40629 0.0713629 3.29255C0.118477 3.17881 0.187532 3.07546 0.274587 2.9884C0.361642 2.90135 0.464992 2.83229 0.578734 2.78518C0.692477 2.73807 0.814386 2.71382 0.9375 2.71382H13.925C14.1338 1.93522 14.5936 1.24726 15.2332 0.756604C15.8728 0.265946 16.6564 0 17.4625 0C18.2686 0 19.0522 0.265946 19.6918 0.756604C20.3314 1.24726 20.7912 1.93522 21 2.71382H24.0625C24.1861 2.71214 24.3087 2.73524 24.4232 2.78175C24.5377 2.82827 24.6418 2.89727 24.7292 2.98466C24.8166 3.07205 24.8855 3.17607 24.9321 3.29057C24.9786 3.40507 25.0017 3.52774 25 3.65132ZM25 11.9013C25.0017 12.0249 24.9786 12.1476 24.9321 12.2621C24.8855 12.3766 24.8166 12.4806 24.7292 12.568C24.6418 12.6554 24.5377 12.7244 24.4232 12.7709C24.3087 12.8174 24.1861 12.8405 24.0625 12.8388H9.4375C9.2287 13.6174 8.76886 14.3054 8.12928 14.796C7.4897 15.2867 6.70611 15.5526 5.9 15.5526C5.09389 15.5526 4.3103 15.2867 3.67072 14.796C3.03114 14.3054 2.5713 13.6174 2.3625 12.8388H0.9375C0.68886 12.8388 0.450403 12.74 0.274587 12.5642C0.0987719 12.3884 0 12.15 0 11.9013C0 11.6527 0.0987719 11.4142 0.274587 11.2384C0.450403 11.0626 0.68886 10.9638 0.9375 10.9638H2.3625C2.5713 10.1852 3.03114 9.49726 3.67072 9.0066C4.3103 8.51595 5.09389 8.25 5.9 8.25C6.70611 8.25 7.4897 8.51595 8.12928 9.0066C8.76886 9.49726 9.2287 10.1852 9.4375 10.9638H24.0625C24.3111 10.9638 24.5496 11.0626 24.7254 11.2384C24.9012 11.4142 25 11.6527 25 11.9013Z" fill="#00D4FF" />
    </Svg>
);

// Heart Rate Icon (for first card)
const HeartRateIcon = () => (
    <Svg width="50" height="50" viewBox="0 0 50 50" fill="none">
        <Defs>
            <LinearGradient id="paint0_linear" x1="25" y1="0" x2="25" y2="50" gradientUnits="userSpaceOnUse">
                <Stop stopColor="#00D4FF" />
                <Stop offset="1" stopColor="#007F99" />
            </LinearGradient>
        </Defs>
        <Rect width="50" height="50" rx="10" fill="url(#paint0_linear)" />
        <Path fillRule="evenodd" clipRule="evenodd" d="M24.9981 11.875C25.2963 11.8747 25.5868 11.9691 25.8278 12.1447C26.0688 12.3203 26.2477 12.568 26.3387 12.8519L32.5 32.1063L34.9113 24.5725C35.0019 24.2885 35.1804 24.0407 35.421 23.8648C35.6616 23.6889 35.9519 23.594 36.25 23.5938H38.5938C38.9667 23.5938 39.3244 23.7419 39.5881 24.0056C39.8518 24.2694 40 24.627 40 25C40 25.373 39.8518 25.7306 39.5881 25.9944C39.3244 26.2581 38.9667 26.4063 38.5938 26.4063H37.2756L33.8387 37.1481C33.7476 37.4315 33.5689 37.6787 33.3283 37.8541C33.0877 38.0294 32.7977 38.1239 32.5 38.1239C32.2023 38.1239 31.9123 38.0294 31.6717 37.8541C31.4311 37.6787 31.2524 37.4315 31.1613 37.1481L25.0094 17.9238L20.7156 31.5175C20.627 31.7976 20.453 32.043 20.2178 32.2191C19.9827 32.3952 19.6982 32.4932 19.4045 32.4994C19.1108 32.5056 18.8225 32.4197 18.5801 32.2537C18.3378 32.0876 18.1535 31.8499 18.0531 31.5738L15.6831 25.0563L15.5519 25.4463C15.4586 25.7262 15.2797 25.9697 15.0405 26.1423C14.8013 26.3149 14.5138 26.4079 14.2188 26.4081H11.4062C11.0333 26.4081 10.6756 26.26 10.4119 25.9962C10.1482 25.7325 10 25.3748 10 25.0019C10 24.6289 10.1482 24.2712 10.4119 24.0075C10.6756 23.7438 11.0333 23.5956 11.4062 23.5956H13.2063L14.29 20.3388C14.3819 20.0613 14.5579 19.8195 14.7936 19.6467C15.0293 19.4739 15.3129 19.3789 15.6051 19.3748C15.8973 19.3706 16.1835 19.4576 16.424 19.6237C16.6644 19.7897 16.8472 20.0266 16.9469 20.3013L19.2812 26.7231L23.6594 12.8594C23.749 12.5744 23.9271 12.3253 24.1678 12.1483C24.4085 11.9713 24.6993 11.8756 24.9981 11.875Z" fill="#0E0E1F" />
    </Svg>
);

// Sleep Icon
const SleepIcon = () => (
    <Svg width="15" height="11" viewBox="0 0 15 11" fill="none">
        <Path d="M0 10.5V6C0 5.6625 0.0687501 5.35625 0.20625 5.08125C0.34375 4.80625 0.525 4.5625 0.75 4.35V2.25C0.75 1.625 0.96875 1.09375 1.40625 0.65625C1.84375 0.21875 2.375 0 3 0H6C6.2875 0 6.55625 0.0532499 6.80625 0.15975C7.05625 0.26625 7.2875 0.413 7.5 0.6C7.7125 0.4125 7.94375 0.26575 8.19375 0.15975C8.44375 0.0537499 8.7125 0.0005 9 0H12C12.625 0 13.1563 0.21875 13.5938 0.65625C14.0312 1.09375 14.25 1.625 14.25 2.25V4.35C14.475 4.5625 14.6563 4.80625 14.7938 5.08125C14.9313 5.35625 15 5.6625 15 6V10.5H13.5V9H1.5V10.5H0ZM8.25 3.75H12.75V2.25C12.75 2.0375 12.678 1.8595 12.534 1.716C12.39 1.5725 12.212 1.5005 12 1.5H9C8.7875 1.5 8.6095 1.572 8.466 1.716C8.3225 1.86 8.2505 2.038 8.25 2.25V3.75ZM2.25 3.75H6.75V2.25C6.75 2.0375 6.678 1.8595 6.534 1.716C6.39 1.5725 6.212 1.5005 6 1.5H3C2.7875 1.5 2.6095 1.572 2.466 1.716C2.3225 1.86 2.2505 2.038 2.25 2.25V3.75Z" fill="#00D4FF" />
    </Svg>
);

// Training Load Icon (chart bars)
const TrainingLoadIcon = () => (
    <Svg width="17" height="15" viewBox="0 0 17 15" fill="none">
        <Path d="M14.25 8.8125C14.25 8.66332 14.1907 8.52024 14.0852 8.41475C13.9798 8.30926 13.8367 8.25 13.6875 8.25H11.4375C11.2883 8.25 11.1452 8.30926 11.0398 8.41475C10.9343 8.52024 10.875 8.66332 10.875 8.8125V13.875H9.75V1.6875C9.75 1.1415 9.7485 0.7875 9.714 0.528C9.681 0.28425 9.62775 0.20775 9.585 0.165C9.54225 0.12225 9.46575 0.0690001 9.222 0.0360001C8.96175 0.00150007 8.6085 0 8.0625 0C7.5165 0 7.1625 0.00150007 6.903 0.0360001C6.65925 0.0690001 6.58275 0.12225 6.54 0.165C6.49725 0.20775 6.444 0.28425 6.411 0.528C6.3765 0.78825 6.375 1.1415 6.375 1.6875V13.875H5.25V5.0625C5.25 4.91332 5.19074 4.77024 5.08525 4.66475C4.97976 4.55926 4.83668 4.5 4.6875 4.5H2.4375C2.28832 4.5 2.14524 4.55926 2.03975 4.66475C1.93426 4.77024 1.875 4.91332 1.875 5.0625V13.875H0.5625C0.413316 13.875 0.270242 13.9343 0.164752 14.0398C0.0592632 14.1452 0 14.2883 0 14.4375C0 14.5867 0.0592632 14.7298 0.164752 14.8352C0.270242 14.9407 0.413316 15 0.5625 15H15.5625C15.7117 15 15.8548 14.9407 15.9602 14.8352C16.0657 14.7298 16.125 14.5867 16.125 14.4375C16.125 14.2883 16.0657 14.1452 15.9602 14.0398C15.8548 13.9343 15.7117 13.875 15.5625 13.875H14.25V8.8125Z" fill="#00D4FF" />
    </Svg>
);

// Energy Icon (lightning bolt)
const EnergyIcon = () => (
    <Svg width="14" height="17" viewBox="0 0 14 17" fill="none">
        <Path fillRule="evenodd" clipRule="evenodd" d="M7.67372 0.272059C8.14772 -0.296441 9.07097 0.0920589 8.99597 0.828559L8.46647 6.00206H12.7497C12.8922 6.00211 13.0318 6.04277 13.152 6.11926C13.2723 6.19576 13.3682 6.30493 13.4287 6.43399C13.4891 6.56305 13.5115 6.70666 13.4933 6.848C13.475 6.98934 13.4169 7.12256 13.3257 7.23206L5.82572 16.2321C5.35172 16.8006 4.42847 16.4121 4.50347 15.6756L5.03297 10.5021H0.749719C0.607209 10.502 0.467663 10.4613 0.347422 10.3849C0.227182 10.3084 0.131225 10.1992 0.0707869 10.0701C0.010349 9.94107 -0.0120677 9.79746 0.00616178 9.65612C0.0243913 9.51478 0.0825125 9.38156 0.173719 9.27206L7.67372 0.272059Z" fill="#00D4FF" />
    </Svg>
);

// Stress/Heart Icon
const StressIcon = () => (
    <Svg width="18" height="16" viewBox="0 0 18 16" fill="none">
        <Path d="M13.21 0C13.8721 0 14.4932 0.123047 15.0732 0.369141C15.6533 0.615234 16.1572 0.955078 16.585 1.38867C17.0127 1.82227 17.3525 2.3291 17.6045 2.90918C17.8564 3.48926 17.9824 4.11035 17.9824 4.77246C17.9824 5.1123 17.9473 5.44922 17.877 5.7832C17.8066 6.11719 17.7012 6.43945 17.5605 6.75H13.4912L11.8037 4.99219L8.99121 7.80469L5.05371 3.86719L2.24121 6.75H0.421875C0.28125 6.43945 0.175781 6.11719 0.105469 5.7832C0.0351562 5.44922 0 5.1123 0 4.77246C0 4.11035 0.123047 3.48926 0.369141 2.90918C0.615234 2.3291 0.955078 1.8252 1.38867 1.39746C1.82227 0.969727 2.3291 0.629883 2.90918 0.37793C3.48926 0.125977 4.11035 0 4.77246 0C5.41113 0 6.02051 0.120117 6.60059 0.360352C7.18066 0.600586 7.69922 0.946289 8.15625 1.39746L8.99121 2.24121L9.82617 1.39746C10.2773 0.946289 10.793 0.600586 11.373 0.360352C11.9531 0.120117 12.5654 0 13.21 0ZM12.3662 7.875H16.8486L16.7256 8.01562C16.6846 8.0625 16.6406 8.1123 16.5938 8.16504L8.99121 15.7588L1.38867 8.16504C1.3418 8.11816 1.29785 8.07129 1.25684 8.02441C1.21582 7.97754 1.1748 7.92773 1.13379 7.875H3.36621L5.05371 6.25781L8.99121 10.1953L11.8037 7.38281L12.3662 7.875Z" fill="#00D4FF" />
    </Svg>
);

// Gauge Component with proper SVG arc
const ReadinessGauge: React.FC<{ score: number; color: 'green' | 'yellow' | 'red' }> = ({ score, color }) => {
    const animatedValue = useRef(new Animated.Value(0)).current;

    const colorMap = {
        green: '#00D4FF',
        yellow: '#FFD700',
        red: '#FF4444',
    };

    const labelMap = {
        green: 'Sinal azul',
        yellow: 'Sinal amarelo',
        red: 'Sinal vermelho',
    };

    useEffect(() => {
        Animated.timing(animatedValue, {
            toValue: score,
            duration: 1500,
            useNativeDriver: false,
        }).start();
    }, [score]);

    const size = 200;
    const strokeWidth = 14;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    // Calculate stroke dash offset based on score
    const strokeDashoffset = animatedValue.interpolate({
        inputRange: [0, 100],
        outputRange: [circumference, circumference * 0.15], // Leave small gap at top
    });

    return (
        <View style={styles.gaugeContainer}>
            <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
                {/* Background circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                {/* Progress circle */}
                <AnimatedCircle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={colorMap[color]}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </Svg>
            <View style={styles.gaugeCenter}>
                <Text style={[styles.gaugeScore, { color: colors.white }]}>{score}%</Text>
                <Text style={[styles.gaugeLabel, { color: colorMap[color] }]}>{labelMap[color]}</Text>
            </View>
        </View>
    );
};

// Metric Card Component with centered text
const MetricCard: React.FC<{
    label: string;
    value: string;
    sublabel?: string;
    icon: 'sleep' | 'load' | 'energy' | 'stress';
}> = ({ label, value, sublabel, icon }) => {
    const renderIcon = () => {
        switch (icon) {
            case 'sleep': return <SleepIcon />;
            case 'load': return <TrainingLoadIcon />;
            case 'energy': return <EnergyIcon />;
            case 'stress': return <StressIcon />;
            default: return null;
        }
    };

    return (
        <View style={styles.metricCard}>
            <View style={styles.metricIconContainer}>
                {renderIcon()}
            </View>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{value}</Text>
            {sublabel && <Text style={styles.metricSublabel}>{sublabel}</Text>}
        </View>
    );
};

export function ReadinessResultScreen({ navigation }: any) {
    const { verdict, isLoading, error, fetchVerdict, resetQuiz } = useReadinessStore();

    useEffect(() => {
        if (!verdict && !isLoading && !error) {
            fetchVerdict();
        }
    }, []);

    const handleConfirm = () => {
        // Navigate to success screen with fade animation
        navigation.navigate('ReadinessSuccess');
    };

    const handleBack = () => {
        navigation.goBack();
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#0A0A14" />
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Analisando sua prontidão...</Text>
                <Text style={styles.loadingSubtext}>Cruzando dados do check-in com seus treinos</Text>
            </View>
        );
    }

    if (error || !verdict) {
        return (
            <View style={styles.errorContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#0E0E1F" />
                <Ionicons name="warning-outline" size={64} color="#FFD700" />
                <Text style={styles.errorText}>{error || 'Erro ao carregar resultado'}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={fetchVerdict}>
                    <Text style={styles.retryButtonText}>Tentar Novamente</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const generatedTime = new Date(verdict.generated_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    });

    const insets = useSafeAreaInsets();

    // Fade-in animation for content
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
            <StatusBar barStyle="light-content" backgroundColor="#0E0E1F" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Veredito de Prontidão</Text>
                <TouchableOpacity style={styles.calendarButton}>
                    <Ionicons name="calendar-outline" size={24} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            >
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    {/* Time Badge */}
                    <View style={styles.timeBadge}>
                        <Text style={styles.timeText}>Análise gerada às {generatedTime}</Text>
                        <Text style={styles.timeSubtext}>Baseada em Check-in + Atividades</Text>
                    </View>

                    {/* Gauge */}
                    <ReadinessGauge score={verdict.readiness_score} color={verdict.status_color} />

                    {/* AI Analysis Card with Adjustment Subcard */}
                    <View style={styles.analysisCard}>
                        <View style={styles.analysisHeader}>
                            <HeartRateIcon />
                            <View style={styles.analysisHeaderText}>
                                <Text style={styles.analysisHeadline}>{verdict.ai_analysis.headline}</Text>
                            </View>
                        </View>
                        <Text style={styles.analysisReasoning}>{verdict.ai_analysis.reasoning}</Text>

                        {/* Adjustment Subcard - inside the main card */}
                        <View style={styles.adjustmentSubcard}>
                            <View style={styles.adjustmentIconContainer}>
                                <AdjustmentIcon />
                            </View>
                            <View style={styles.adjustmentTextContainer}>
                                <Text style={styles.adjustmentTitle}>AJUSTE PRÁTICO</Text>
                                <Text style={styles.adjustmentText}>{verdict.ai_analysis.plan_adjustment}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Metrics Grid 2x2 */}
                    <View style={styles.metricsGrid}>
                        <MetricCard
                            icon="sleep"
                            label="Sono"
                            value={verdict.metrics_summary?.[0]?.value || "7h 30m"}
                            sublabel={verdict.metrics_summary?.[0]?.sublabel}
                        />
                        <MetricCard
                            icon="load"
                            label="Carga de Treino"
                            value={verdict.metrics_summary?.[1]?.value || "Moderada"}
                            sublabel={verdict.metrics_summary?.[1]?.sublabel}
                        />
                        <MetricCard
                            icon="energy"
                            label="Energia"
                            value={verdict.metrics_summary?.[2]?.value || "8/10"}
                            sublabel={verdict.metrics_summary?.[2]?.sublabel}
                        />
                        <MetricCard
                            icon="stress"
                            label="Estresse"
                            value={verdict.metrics_summary?.[3]?.value || "Baixo"}
                            sublabel={verdict.metrics_summary?.[3]?.sublabel}
                        />
                    </View>

                    {/* Confirm Button - Inside ScrollView */}
                    <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                        <Text style={styles.confirmButtonText}>Confirmar</Text>
                        <Ionicons name="arrow-forward-circle" size={22} color="#0E0E1F" />
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0E0E1F',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
    },
    backButton: {
        padding: spacing.xs,
    },
    backIcon: {
        fontSize: 24,
        color: colors.white,
    },
    headerTitle: {
        fontSize: typography.fontSizes.md,
        fontWeight: '600',
        color: colors.white,
    },
    calendarButton: {
        padding: spacing.xs,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacing.lg,
    },
    timeBadge: {
        alignItems: 'center',
        marginTop: 32,
        marginBottom: 28,
    },
    timeText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: '600',
        color: colors.primary,
    },
    timeSubtext: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: spacing.xs,
    },
    gaugeContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing['2xl'],
        position: 'relative',
    },
    gaugeCenter: {
        position: 'absolute',
        alignItems: 'center',
    },
    gaugeScore: {
        fontSize: 48,
        fontWeight: '700',
    },
    gaugeLabel: {
        fontSize: typography.fontSizes.md,
        fontWeight: '500',
        marginTop: spacing.xs,
    },
    analysisCard: {
        backgroundColor: '#12121F',
        borderRadius: 20,
        padding: spacing.lg,
        marginBottom: spacing.xl,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    analysisHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
        gap: spacing.md,
    },
    analysisHeaderText: {
        flex: 1,
    },
    analysisHeadline: {
        fontSize: typography.fontSizes.md,
        fontWeight: '700',
        color: colors.white,
        lineHeight: 24,
    },
    analysisReasoning: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 20,
        marginBottom: spacing.lg,
    },
    adjustmentSubcard: {
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
        borderRadius: 16,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    adjustmentIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 12,
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    adjustmentTextContainer: {
        flex: 1,
    },
    adjustmentTitle: {
        fontSize: typography.fontSizes.xs,
        fontWeight: '700',
        color: colors.primary,
        letterSpacing: 1,
        marginBottom: spacing.xs,
    },
    adjustmentText: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(255, 255, 255, 0.8)',
        lineHeight: 18,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 32,
        marginTop: 8,
    },
    metricCard: {
        flexBasis: '47%',
        flexGrow: 1,
        minHeight: 120,
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    metricIconContainer: {
        marginBottom: spacing.sm,
    },
    metricLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    metricValue: {
        fontSize: typography.fontSizes.lg,
        fontWeight: '700',
        color: colors.white,
        textAlign: 'center',
    },
    metricSublabel: {
        fontSize: typography.fontSizes.xs,
        color: colors.primary,
        marginTop: spacing.xs,
        textAlign: 'center',
    },
    confirmButton: {
        flexDirection: 'row',
        backgroundColor: colors.primary,
        paddingVertical: 18,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
    },
    confirmButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: '700',
        color: '#0E0E1F',
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#0A0A14',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        fontSize: typography.fontSizes.lg,
        fontWeight: '600',
        color: colors.white,
        marginTop: spacing.lg,
    },
    loadingSubtext: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: spacing.xs,
    },
    errorContainer: {
        flex: 1,
        backgroundColor: '#0A0A14',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    warningIcon: {
        fontSize: 48,
    },
    errorText: {
        fontSize: typography.fontSizes.md,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        marginTop: spacing.lg,
        marginBottom: spacing.xl,
    },
    retryButton: {
        backgroundColor: colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 24,
    },
    retryButtonText: {
        fontSize: typography.fontSizes.md,
        fontWeight: '600',
        color: '#0A0A14',
    },
});
