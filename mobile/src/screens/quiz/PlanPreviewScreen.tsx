import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Dimensions,
    Platform,
    ScrollView,
} from 'react-native';
import { colors } from '../../theme';
import { useOnboardingStore } from '../../stores/onboardingStore';
import Svg, { Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuizProgressBar } from '../../components/QuizProgressBar';


const { width } = Dimensions.get('window');

// Progress Step Icons
const WalkingIcon = ({ active }: { active: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 20 21" fill="none">
        <Path
            d="M10.5 4.5C11.3284 4.5 12 3.82843 12 3C12 2.17157 11.3284 1.5 10.5 1.5C9.67157 1.5 9 2.17157 9 3C9 3.82843 9.67157 4.5 10.5 4.5ZM7.5 7.5L5 17L7.5 17.5L9 12L10.5 13.5V19.5H12.5V12L11 9L11.5 6.5L13.5 8.5H16.5V6.5H14.5L11.5 3.5C11.2239 3.22386 10.8978 3.08579 10.5217 3.08579C10.1457 3.08579 9.81957 3.22386 9.54343 3.5C9.34343 3.7 9.10914 4.09286 9 4.5L7.5 7.5Z"
            fill={active ? '#00D4FF' : 'rgba(235, 235, 245, 0.6)'}
        />
    </Svg>
);

const RunningIcon = ({ active }: { active: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 20 21" fill="none">
        <Path
            d="M13.3333 4.66667C14.2538 4.66667 15 3.92048 15 3C15 2.07952 14.2538 1.33333 13.3333 1.33333C12.4129 1.33333 11.6667 2.07952 11.6667 3C11.6667 3.92048 12.4129 4.66667 13.3333 4.66667ZM10.8333 7.5L8.33333 9.16667L10 12.5L7.5 17.5H9.58333L11.25 13.75L13.3333 15V18.3333H15V13.75L13.3333 11.25L14.1667 8.33333L15.8333 10H18.3333V8.33333H16.6667L14.1667 5.83333C13.75 5.41667 13.25 5.16667 12.6667 5.16667C12.0833 5.16667 11.5833 5.41667 11.1667 5.83333L9.16667 7.83333C8.75 8.25 8.5 8.75 8.5 9.33333C8.5 9.91667 8.75 10.4167 9.16667 10.8333L10.8333 12.5V7.5ZM5 10.8333L3.33333 17.5H5.41667L6.25 14.1667L7.5 15.4167V17.5H9.16667V14.1667L7.91667 12.9167L8.33333 11.25L5 10.8333Z"
            fill={active ? '#00D4FF' : 'rgba(235, 235, 245, 0.6)'}
        />
    </Svg>
);

const TrophyIcon = ({ active }: { active: boolean }) => (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
        <Path
            d="M5.83333 2.5H14.1667V4.16667H15.8333V6.66667C15.8333 7.54762 15.1842 8.33333 14.1667 8.33333V10C14.1667 11.3807 13.0474 12.5 11.6667 12.5H10.8333V14.1667H12.5C12.9602 14.1667 13.3333 14.5398 13.3333 15V16.6667H6.66667V15C6.66667 14.5398 7.03976 14.1667 7.5 14.1667H9.16667V12.5H8.33333C6.95262 12.5 5.83333 11.3807 5.83333 10V8.33333C4.81583 8.33333 4.16667 7.54762 4.16667 6.66667V4.16667H5.83333V2.5ZM5.83333 5.83333H4.16667V6.66667H5.83333V5.83333ZM14.1667 5.83333V6.66667H15.8333V5.83333H14.1667Z"
            fill={active ? '#00D4FF' : 'rgba(235, 235, 245, 0.6)'}
        />
    </Svg>
);

const LockIcon = () => (
    <Svg width={20} height={20} viewBox="0 0 20 21" fill="none">
        <Path
            d="M14.1667 9.66667V7.16667C14.1667 4.86548 12.3012 3 10 3C7.69881 3 5.83333 4.86548 5.83333 7.16667V9.66667M6.5 18H13.5C14.9001 18 15.6002 18 16.135 17.7275C16.6054 17.4878 16.9878 17.1054 17.2275 16.635C17.5 16.1002 17.5 15.4001 17.5 14V13.6667C17.5 12.2665 17.5 11.5665 17.2275 11.0316C16.9878 10.5613 16.6054 10.1788 16.135 9.93915C15.6002 9.66667 14.9001 9.66667 13.5 9.66667H6.5C5.09987 9.66667 4.3998 9.66667 3.86502 9.93915C3.39462 10.1788 3.01217 10.5613 2.77248 11.0316C2.5 11.5665 2.5 12.2665 2.5 13.6667V14C2.5 15.4001 2.5 16.1002 2.77248 16.635C3.01217 17.1054 3.39462 17.4878 3.86502 17.7275C4.3998 18 5.09987 18 6.5 18Z"
            stroke="rgba(235, 235, 245, 0.6)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        />
    </Svg>
);

// 4 Weeks Icon (Lightning bolt)
const FourWeeksIcon = ({ selected }: { selected: boolean }) => (
    <View style={[styles.optionIconContainer]}>
        <Svg width={18} height={22} viewBox="0 0 18 22" fill="none">
            <Path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M10.2321 0.36C10.8641 -0.398 12.0951 0.12 11.9951 1.102L11.2891 8H17.0001C17.1901 8.00006 17.3762 8.05432 17.5365 8.15632C17.6968 8.25831 17.8248 8.40378 17.9054 8.57592C17.9859 8.74805 18.0158 8.93949 17.9915 9.12795C17.9672 9.31641 17.8897 9.49399 17.7681 9.64L7.76814 21.64C7.13614 22.398 5.90514 21.88 6.00514 20.898L6.71114 14H0.000137329C-0.189828 13.9999 -0.376021 13.9457 -0.536279 13.8437C-0.696538 13.7417 -0.82449 13.5962 -0.90509 13.4241C-0.98569 13.252 -1.01556 13.0605 -0.991302 12.8721C-0.967048 12.6836 -0.889475 12.506 -0.767863 12.36L10.2321 0.36Z"
                fill={selected ? '#00D4FF' : '#EBEBF5'}
            />
        </Svg>
    </View>
);

// 8 Weeks Icon (Chart line)
const EightWeeksIcon = ({ selected }: { selected: boolean }) => (
    <View style={[styles.optionIconContainer]}>
        <Svg width={20} height={14} viewBox="0 0 20 14" fill="none">
            <Path
                d="M1.5 12.5L7.5 6.5L11.5 10.5L20 0.92L18.59 -0.5L11.5 7.5L7.5 3.5L0 11L1.5 12.5Z"
                fill={selected ? '#00D4FF' : '#EBEBF5'}
            />
        </Svg>
    </View>
);

// 12 Weeks Icon (Dumbbell/Gym)
const TwelveWeeksIcon = ({ selected }: { selected: boolean }) => (
    <View style={[styles.optionIconContainer]}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
                d="M20.57 14.86L22 13.43L20.57 12L17 15.57L8.43 7L12 3.43L10.57 2L9.14 3.43L7.71 2L5.57 4.14L4.14 2.71L2.71 4.14L4.14 5.57L2 7.71L3.43 9.14L2 10.57L3.43 12L7 8.43L15.57 17L12 20.57L13.43 22L14.86 20.57L16.29 22L18.43 19.86L19.86 21.29L21.29 19.86L19.86 18.43L22 16.29L20.57 14.86Z"
                fill={selected ? '#00D4FF' : '#EBEBF5'}
            />
        </Svg>
    </View>
);

// 16+ Weeks Icon (Medal)
const SixteenWeeksIcon = ({ selected }: { selected: boolean }) => (
    <View style={[styles.optionIconContainer]}>
        <Svg width={18} height={22} viewBox="0 0 18 22" fill="none">
            <Path
                d="M9 6C11.1217 6 13.1566 6.84285 14.6569 8.34315C16.1571 9.84344 17 11.8783 17 14C17 16.1217 16.1571 18.1566 14.6569 19.6569C13.1566 21.1571 11.1217 22 9 22C6.87827 22 4.84344 21.1571 3.34315 19.6569C1.84285 18.1566 1 16.1217 1 14C1 11.8783 1.84285 9.84344 3.34315 8.34315C4.84344 6.84285 6.87827 6 9 6ZM9 9.5L7.678 12.18L4.72 12.61L6.86 14.695L6.355 17.641L9 16.25L11.645 17.64L11.14 14.695L13.28 12.609L10.322 12.179L9 9.5ZM10 0.999L15 1V4L13.637 5.138C12.5062 4.54413 11.2712 4.17469 10 4.05V0.999ZM8 0.999V4.049C6.72923 4.17385 5.49452 4.54327 4.364 5.137L3 4V1L8 0.999Z"
                fill={selected ? '#00D4FF' : '#EBEBF5'}
            />
        </Svg>
    </View>
);

// Unlock Icon for button
const UnlockIcon = () => (
    <Svg width={19} height={22} viewBox="0 0 19 22" fill="none">
        <Path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M9 0C10.091 0 11.117 0.292 12 0.804C12.1195 0.866515 12.2251 0.952558 12.3105 1.05695C12.3959 1.16135 12.4593 1.28194 12.4969 1.41146C12.5345 1.54099 12.5454 1.67678 12.5292 1.81067C12.5129 1.94455 12.4697 2.07376 12.4022 2.19053C12.3348 2.30729 12.2443 2.4092 12.1364 2.49012C12.0285 2.57103 11.9054 2.62928 11.7744 2.66137C11.6434 2.69346 11.5073 2.69871 11.3742 2.67683C11.2411 2.65494 11.1138 2.60635 11 2.534C10.3918 2.18285 9.70183 1.99802 8.99953 1.9981C8.29722 1.99818 7.60731 2.18318 6.99918 2.53447C6.39105 2.88577 5.88612 3.39099 5.53519 3.99933C5.18425 4.60768 4.99967 5.29769 5 6L16 6.001C16.5304 6.001 17.0391 6.21171 17.4142 6.58679C17.7893 6.96186 18 7.47057 18 8.001V18.001C18 18.5314 17.7893 19.0401 17.4142 19.4152C17.0391 19.7903 16.5304 20.001 16 20.001H2C1.46957 20.001 0.960859 19.7903 0.585786 19.4152C0.210714 19.0401 0 18.5314 0 18.001V8C0 7.46957 0.210714 6.96086 0.585786 6.58579C0.960859 6.21071 1.46957 6 2 6H3C3 4.4087 3.63214 2.88258 4.75736 1.75736C5.88258 0.632141 7.4087 0 9 0ZM9 10C8.55975 10 8.1318 10.1453 7.78253 10.4133C7.43326 10.6813 7.18219 11.0571 7.06824 11.4824C6.95429 11.9076 6.98384 12.3586 7.15231 12.7653C7.32077 13.1721 7.61874 13.5119 8 13.732V15C8 15.2652 8.10536 15.5196 8.29289 15.7071C8.48043 15.8946 8.73478 16 9 16C9.26522 16 9.51957 15.8946 9.70711 15.7071C9.89464 15.5196 10 15.2652 10 15V13.732C10.3813 13.5119 10.6792 13.1721 10.8477 12.7653C11.0162 12.3586 11.0457 11.9076 10.9318 11.4824C10.8178 11.0571 10.5667 10.6813 10.2175 10.4133C9.8682 10.1453 9.44025 10 9 10Z"
            fill="#0E0E1F"
        />
    </Svg>
);

const TIMEFRAME_OPTIONS = [
    {
        id: '4_weeks',
        weeks: 4,
        title: '4 semanas',
        subtitle: 'Foco Rápido',
        Icon: FourWeeksIcon,
    },
    {
        id: '8_weeks',
        weeks: 8,
        title: '8 semanas',
        subtitle: 'Evolução Constante',
        Icon: EightWeeksIcon,
    },
    {
        id: '12_weeks',
        weeks: 12,
        title: '12 semanas',
        subtitle: 'Preparação Sólida',
        Icon: TwelveWeeksIcon,
    },
    {
        id: '16_weeks',
        weeks: 16,
        title: '16+ semanas',
        subtitle: 'Maratona/Longo Prazo',
        Icon: SixteenWeeksIcon,
    },
];

export function PlanPreviewScreen({ navigation, route }: any) {
    const userId = route?.params?.userId;
    const { data, updateData } = useOnboardingStore();
    const [selectedTimeframe, setSelectedTimeframe] = useState<string | null>(null);
    const insets = useSafeAreaInsets();

    const handleSelect = (id: string) => {
        setSelectedTimeframe(id);
        // Extract weeks number from id (e.g., '4_weeks' -> 4)
        const weeks = parseInt(id.split('_')[0]);
        updateData({ targetWeeks: weeks });
    };

    const handleUnlockPlan = () => {
        if (!selectedTimeframe) return;

        // Navigate to loading screen which will handle plan generation
        navigation.navigate('Quiz_PlanLoading', {
            userId,
            timeframe: selectedTimeframe,
        });
    };


    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
            >
                <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
                    {/* Progress Indicator */}
                    <QuizProgressBar currentStep={6} />

                    {/* Title Section */}
                    <View style={styles.titleContainer}>
                        <Text style={styles.title}>Quando você deseja atingir este objetivo?</Text>
                        <Text style={styles.subtitle}>
                            Selecione um prazo para a IA ajustar a{'\n'}intensidade e volume do seu plano de{'\n'}treino.
                        </Text>
                    </View>

                    {/* Options */}
                    <View style={styles.optionsContainer}>
                        {TIMEFRAME_OPTIONS.map((option) => {
                            const isSelected = selectedTimeframe === option.id;
                            const Icon = option.Icon;
                            return (
                                <TouchableOpacity
                                    key={option.id}
                                    style={[
                                        styles.optionCard,
                                        isSelected && styles.optionCardSelected,
                                    ]}
                                    onPress={() => handleSelect(option.id)}
                                    activeOpacity={0.7}
                                >
                                    <Icon selected={isSelected} />
                                    <View style={styles.optionTextContainer}>
                                        <Text style={styles.optionTitle}>{option.title}</Text>
                                        <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                                    </View>
                                    <View style={[
                                        styles.radioButton,
                                        isSelected && styles.radioButtonSelected
                                    ]}>
                                        {isSelected && <View style={styles.radioButtonInner} />}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </ScrollView>

            {/* Unlock Plan Button */}
            <View style={[styles.bottomButtonContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <TouchableOpacity
                    style={[
                        styles.unlockButton,
                        !selectedTimeframe && styles.unlockButtonDisabled
                    ]}
                    onPress={handleUnlockPlan}
                    disabled={!selectedTimeframe}
                    activeOpacity={0.8}
                >
                    <Text style={[
                        styles.unlockButtonText,
                        !selectedTimeframe && styles.unlockButtonTextDisabled
                    ]}>Desbloquear plano</Text>
                    <UnlockIcon />
                </TouchableOpacity>
            </View>
        </View>
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
        flex: 1,
        paddingHorizontal: 20,
    },
    progressContainer: {
        marginBottom: 24,
    },
    progressText: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        marginBottom: 12,
    },
    progressNumber: {
        color: '#00D4FF',
        fontWeight: '600',
    },
    progressTotal: {
        color: '#00D4FF',
    },
    progressSteps: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    stepContainer: {
        alignItems: 'center',
    },
    stepLine: {
        width: 44,
        height: 4,
        backgroundColor: 'rgba(235, 235, 245, 0.1)',
        borderRadius: 20,
        marginTop: 8,
    },
    stepLineActive: {
        backgroundColor: '#00D4FF',
    },
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: colors.white,
        lineHeight: 36,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        lineHeight: 22,
    },
    optionsContainer: {
        gap: 12,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#15152A',
        borderRadius: 16,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionCardSelected: {
        borderColor: '#00D4FF',
        backgroundColor: 'rgba(0, 212, 255, 0.05)',
    },
    optionIconContainer: {
        width: 47,
        height: 47,
        borderRadius: 10,
        backgroundColor: '#15152A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionTextContainer: {
        flex: 1,
        marginLeft: 16,
    },
    optionTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.white,
        marginBottom: 2,
    },
    optionSubtitle: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
    },
    radioButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 2,
        borderColor: 'rgba(235, 235, 245, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioButtonSelected: {
        borderColor: '#00D4FF',
    },
    radioButtonInner: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#00D4FF',
    },
    bottomButtonContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingTop: 20,
        backgroundColor: colors.background,
    },
    unlockButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00D4FF',
        borderRadius: 16,
        paddingVertical: 16,
        gap: 12,
    },
    unlockButtonDisabled: {
        backgroundColor: 'rgba(0, 212, 255, 0.3)',
    },
    unlockButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#0E0E1F',
    },
    unlockButtonTextDisabled: {
        color: 'rgba(14, 14, 31, 0.5)',
    },
    errorContainer: {
        backgroundColor: 'rgba(255, 59, 48, 0.1)',
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 20,
        marginBottom: 10,
    },
    errorText: {
        color: '#FF3B30',
        fontSize: 14,
        textAlign: 'center',
    },
});

export default PlanPreviewScreen;
