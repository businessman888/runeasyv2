import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { colors, typography, borderRadius, shadows } from '../../theme';
import Svg, { Path, Rect } from 'react-native-svg';

// Option Icons - Dark cards with theme colors
const Icon5K = () => (
    <Svg width={47} height={47} viewBox="0 0 47 47" fill="none">
        <Rect width={47} height={47} rx={10} fill={colors.card} />
        <Path d="M24.2186 12.2C25.3774 12.2 26.3186 13.1413 26.3186 14.3C26.3186 15.4588 25.3774 16.4 24.2186 16.4C23.0599 16.4 22.1186 15.4588 22.1186 14.3C22.1186 13.1413 23.0599 12.2 24.2186 12.2ZM19.2349 20C19.1111 20 19.0024 20.075 18.9574 20.1875L18.1324 22.2463C17.8849 22.8613 17.1874 23.1613 16.5724 22.9138C15.9574 22.6663 15.6574 21.9688 15.9049 21.3538L16.7261 19.295C17.1386 18.2713 18.1286 17.6 19.2349 17.6H22.8836C23.9524 17.6 24.9386 18.1663 25.4749 19.0888L26.7049 21.2H29.0149C29.6786 21.2 30.2149 21.7363 30.2149 22.4C30.2149 23.0638 29.6786 23.6 29.0149 23.6H26.7049C25.8499 23.6 25.0624 23.1463 24.6311 22.4075L24.2561 21.7663L23.4799 24.4063L26.3074 25.2538C27.3461 25.565 27.8749 26.7163 27.4361 27.71L25.3136 32.4875C25.0436 33.095 24.3349 33.365 23.7311 33.095C23.1274 32.825 22.8536 32.1163 23.1236 31.5125L24.9686 27.3575L21.3724 26.2775C20.1461 25.91 19.4224 24.6388 19.7336 23.3975L20.5849 20H19.2386H19.2349ZM18.9349 26.7875C19.4336 27.3463 20.0861 27.7738 20.8549 28.0025L21.0311 28.055L20.7724 28.7788C20.5549 29.39 20.1724 29.9338 19.6736 30.3463L16.5836 32.8925C16.0736 33.3125 15.3161 33.2413 14.8961 32.7313C14.4761 32.2213 14.5474 31.4638 15.0574 31.0438L18.1474 28.4975C18.3161 28.3588 18.4399 28.1788 18.5149 27.9763L18.9349 26.7875Z" fill={colors.textLight} />
    </Svg>
);

const Icon10K = () => (
    <Svg width={47} height={47} viewBox="0 0 47 47" fill="none">
        <Rect width={47} height={47} rx={10} fill={colors.card} />
        <Path d="M19.393 13.8872C19.3644 13.7306 19.2747 13.5918 19.1437 13.5014C19.0128 13.4109 18.8512 13.3762 18.6946 13.4048C18.538 13.4335 18.3993 13.5231 18.3088 13.6541C18.2183 13.7851 18.1836 13.9466 18.2122 14.1032L18.223 14.1584C16.1482 14.846 14.9254 15.9464 14.2306 17.174C13.5526 18.374 13.4182 19.634 13.4026 20.6H13.4002V20.6048L12.5962 21.6104C12.4411 21.8045 12.3278 22.0285 12.2635 22.2685C12.1992 22.5085 12.1853 22.7591 12.2226 23.0047C12.2599 23.2504 12.3476 23.4856 12.4803 23.6956C12.613 23.9057 12.7877 24.086 12.9934 24.2252L23.3794 31.2572C24.6701 32.1318 26.1932 32.5995 27.7522 32.6H31.1002C31.4875 32.6 31.8702 32.5168 32.2224 32.3559C32.5746 32.1949 32.8881 31.9601 33.1416 31.6674C33.3951 31.3746 33.5826 31.0308 33.6915 30.6592C33.8004 30.2876 33.828 29.8969 33.7726 29.5136C33.5806 28.1972 32.4682 27.2528 31.3162 26.888C30.5854 26.6552 29.9002 26.2772 29.4994 25.682L25.879 19.454L26.095 19.4204C26.1737 19.4084 26.2492 19.3809 26.3172 19.3395C26.3851 19.298 26.4441 19.2435 26.4908 19.179C26.5375 19.1146 26.5708 19.0414 26.589 18.9639C26.6071 18.8864 26.6096 18.8061 26.5964 18.7276C26.5832 18.6492 26.5545 18.5741 26.512 18.5068C26.4695 18.4395 26.414 18.3814 26.3488 18.3357C26.2836 18.2901 26.21 18.2579 26.1322 18.2409C26.0545 18.224 25.9741 18.2228 25.8958 18.2372C25.5534 18.294 25.2142 18.3216 24.8782 18.32C22.3942 18.3068 20.2006 16.7156 19.5226 14.4296C19.469 14.2515 19.4257 14.0704 19.393 13.8872ZM16.6042 16.2896L19.2382 20.8508C19.3974 21.1263 19.4408 21.4537 19.3586 21.7611C19.2765 22.0685 19.0756 22.3307 18.8002 22.49L17.7526 23.096L14.6002 20.9684V20.816C14.6002 19.8968 14.6986 18.7856 15.2758 17.7644C15.5638 17.2532 15.985 16.7444 16.6054 16.2884M19.1986 24.0704L22.8538 21.9584C22.9904 21.8797 23.1411 21.8286 23.2974 21.8081C23.4537 21.7876 23.6124 21.7982 23.7647 21.8391C23.9169 21.8799 24.0596 21.9504 24.1845 22.0465C24.3095 22.1425 24.4143 22.2623 24.493 22.3988L25.2166 23.6516C25.3757 23.9272 25.4189 24.2548 25.3365 24.5622C25.2541 24.8696 25.053 25.1317 24.7774 25.2908L22.747 26.4632L19.1986 24.0704ZM27.7894 30.2H32.5702C32.431 30.884 31.8262 31.4 31.1002 31.4H27.7522C26.4329 31.4 25.1438 31.0046 24.0514 30.2648L13.6666 23.2316C13.5981 23.1852 13.54 23.1251 13.4958 23.0551C13.4517 22.9851 13.4225 22.9067 13.4101 22.8249C13.3977 22.7431 13.4024 22.6596 13.4238 22.5796C13.4452 22.4997 13.483 22.4251 13.5346 22.3604L13.8778 21.9284L24.769 29.276C25.6612 29.8782 26.713 30.1999 27.7894 30.2Z" fill={colors.textLight} />
    </Svg>
);

const IconMeiaMaratona = () => (
    <Svg width={47} height={47} viewBox="0 0 47 47" fill="none">
        <Rect width={47} height={47} rx={10} fill={colors.card} />
        <Path d="M21 14C20.7167 14 20.4793 13.904 20.288 13.712C20.0967 13.52 20.0007 13.2827 20 13C19.9993 12.7173 20.0953 12.48 20.288 12.288C20.4807 12.096 20.718 12 21 12H25C25.2833 12 25.521 12.096 25.713 12.288C25.905 12.48 26.0007 12.7173 26 13C25.9993 13.2827 25.9033 13.5203 25.712 13.713C25.5207 13.9057 25.2833 14.0013 25 14H21ZM23 25C23.2833 25 23.521 24.904 23.713 24.712C23.905 24.52 24.0007 24.2827 24 24V20C24 19.7167 23.904 19.4793 23.712 19.288C23.52 19.0967 23.2827 19.0007 23 19C22.7173 18.9993 22.48 19.0953 22.288 19.288C22.096 19.4807 22 19.718 22 20V24C22 24.2833 22.096 24.521 22.288 24.713C22.48 24.905 22.7173 25.0007 23 25ZM23 33C21.7667 33 20.604 32.7627 19.512 32.288C18.42 31.8133 17.466 31.1673 16.65 30.35C15.834 29.5327 15.1883 28.5783 14.713 27.487C14.2377 26.3957 14 25.2333 14 24C14 22.7667 14.2377 21.604 14.713 20.512C15.1883 19.42 15.834 18.466 16.65 17.65C17.466 16.834 18.4203 16.1883 19.513 15.713C20.6057 15.2377 21.768 15 23 15C24.0333 15 25.025 15.1667 25.975 15.5C26.925 15.8333 27.8167 16.3167 28.65 16.95L29.35 16.25C29.5333 16.0667 29.7667 15.975 30.05 15.975C30.3333 15.975 30.5667 16.0667 30.75 16.25C30.9333 16.4333 31.025 16.6667 31.025 16.95C31.025 17.2333 30.9333 17.4667 30.75 17.65L30.05 18.35C30.6833 19.1833 31.1667 20.075 31.5 21.025C31.8333 21.975 32 22.9667 32 24C32 25.2333 31.7623 26.396 31.287 27.488C30.8117 28.58 30.166 29.534 29.35 30.35C28.534 31.166 27.5797 31.812 26.487 32.288C25.3943 32.764 24.232 33.0013 23 33Z" fill={colors.textLight} />
    </Svg>
);

const IconMaratona = () => (
    <Svg width={47} height={47} viewBox="0 0 47 47" fill="none">
        <Rect width={47} height={47} rx={10} fill={colors.card} />
        <Path d="M19 33V31H23V27.9C22.1833 27.7167 21.4543 27.371 20.813 26.863C20.1717 26.355 19.7007 25.7173 19.4 24.95C18.15 24.8 17.1043 24.2543 16.263 23.313C15.4217 22.3717 15.0007 21.2673 15 20V19C15 18.45 15.196 17.9793 15.588 17.588C15.98 17.1967 16.4507 17.0007 17 17H19V15H29V17H31C31.55 17 32.021 17.196 32.413 17.588C32.805 17.98 33.0007 18.4507 33 19V20C33 21.2667 32.579 22.371 31.737 23.313C30.895 24.255 29.8493 24.8007 28.6 24.95C28.3 25.7167 27.8293 26.3543 27.188 26.863C26.5467 27.3717 25.8173 27.7173 25 27.9V31H29V33H19ZM19 22.8V19H17V20C17 20.6333 17.1833 21.2043 17.55 21.713C17.9167 22.2217 18.4 22.584 19 22.8ZM29 22.8C29.6 22.5833 30.0833 22.2207 30.45 21.712C30.8167 21.2033 31 20.6327 31 20V19H29V22.8Z" fill={colors.textLight} />
    </Svg>
);

const IconFitnessGeral = () => (
    <Svg width={47} height={47} viewBox="0 0 47 47" fill="none">
        <Rect width={47} height={47} rx={10} fill={colors.card} />
        <Path d="M28.317 15.923C29.625 15.923 30.7327 16.4243 31.64 17.427C32.5473 18.4296 33.0007 19.6396 33 21.057C33 21.3836 32.9737 21.7086 32.921 22.032C32.8683 22.3553 32.7813 22.678 32.66 23H27.525L25.825 20.45C25.7417 20.3166 25.625 20.2083 25.475 20.125C25.325 20.0416 25.1667 20 25 20C24.7833 20 24.5877 20.0666 24.413 20.2C24.2383 20.3333 24.1173 20.5 24.05 20.7L22.7 24.75L21.825 23.45C21.7417 23.3166 21.625 23.2083 21.475 23.125C21.325 23.0416 21.1667 23 21 23H15.34C15.2187 22.6913 15.1317 22.375 15.079 22.051C15.0263 21.727 15 21.4043 15 21.083C15 19.6476 15.4493 18.429 16.348 17.427C17.2467 16.425 18.35 15.9236 19.658 15.923C20.342 15.923 21 16.0623 21.632 16.341C22.2633 16.619 22.8283 17.022 23.327 17.55L24 18.262L24.635 17.589C25.1423 17.0476 25.715 16.6346 26.353 16.35C26.991 16.0653 27.6457 15.923 28.317 15.923ZM24 32.019C23.8413 32.019 23.682 31.9873 23.522 31.924C23.362 31.8606 23.2253 31.7653 23.112 31.638L16.796 25.298C16.7473 25.2493 16.7007 25.2006 16.656 25.152C16.6113 25.1033 16.566 25.0526 16.52 25H20.45L22.15 27.55C22.2333 27.6833 22.35 27.7916 22.5 27.875C22.65 27.9583 22.8083 28 22.975 28C23.1917 28 23.3917 27.9333 23.575 27.8C23.7583 27.6666 23.8833 27.5 23.95 27.3L25.3 23.25L26.15 24.55C26.25 24.6833 26.375 24.7916 26.525 24.875C26.675 24.9583 26.8333 25 27 25H31.473L31.339 25.146L31.204 25.292L24.864 31.639C24.7367 31.7656 24.6007 31.8606 24.456 31.924C24.3113 31.9873 24.1593 32.019 24 32.019Z" fill={colors.textLight} />
    </Svg>
);

// Radio Button Component with theme colors
const RadioButton = ({ selected }: { selected: boolean }) => (
    <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
    </View>
);

interface ObjectiveOption {
    id: string;
    storeValue: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
}

const objectives: ObjectiveOption[] = [
    { id: '5k', storeValue: '5k', icon: <Icon5K />, title: '5K', subtitle: 'Primeiros passos' },
    { id: '10k', storeValue: '10k', icon: <Icon10K />, title: '10K', subtitle: 'Resistência' },
    { id: 'meia', storeValue: 'half_marathon', icon: <IconMeiaMaratona />, title: 'Meia Maratona', subtitle: '21km' },
    { id: 'maratona', storeValue: 'marathon', icon: <IconMaratona />, title: 'Maratona', subtitle: '42km - Desafio supremo' },
    { id: 'fitness', storeValue: 'general_fitness', icon: <IconFitnessGeral />, title: 'Fitness Geral', subtitle: 'Saúde e bem-estar' },
];

interface ObjectiveScreenProps {
    value?: string;
    onChange?: (value: string) => void;
}

export function ObjectiveScreen({ value, onChange }: ObjectiveScreenProps) {
    const [selectedObjective, setSelectedObjective] = useState<string | null>(value || null);

    useEffect(() => {
        setSelectedObjective(value || null);
    }, [value]);

    const handleSelect = (option: ObjectiveOption) => {
        setSelectedObjective(option.storeValue);
        if (onChange) {
            onChange(option.storeValue);
        }
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>Qual é o seu principal{'\n'}objetivo?</Text>
                <Text style={styles.subtitle}>
                    Vamos personalizar seu treino para sua{'\n'}meta específica.
                </Text>
            </View>

            {/* Options */}
            <View style={styles.optionsContainer}>
                {objectives.map((option) => (
                    <TouchableOpacity
                        key={option.id}
                        style={[
                            styles.optionCard,
                            selectedObjective === option.storeValue && styles.optionCardSelected
                        ]}
                        onPress={() => handleSelect(option)}
                        activeOpacity={0.7}
                    >
                        {option.icon}
                        <View style={styles.optionTextContainer}>
                            <Text style={styles.optionTitle}>{option.title}</Text>
                            <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                        </View>
                        <RadioButton selected={selectedObjective === option.storeValue} />
                    </TouchableOpacity>
                ))}
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    titleContainer: {
        marginBottom: 24,
    },
    title: {
        fontSize: typography.fontSizes['3xl'],
        fontWeight: typography.fontWeights.bold,
        color: colors.text,
        lineHeight: 36,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
        lineHeight: 22,
    },
    optionsContainer: {
        gap: 12,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.xl,
        padding: 12,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionCardSelected: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(0, 212, 255, 0.08)',
    },
    optionTextContainer: {
        flex: 1,
        marginLeft: 12,
    },
    optionTitle: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.semibold,
        color: colors.text,
        marginBottom: 2,
    },
    optionSubtitle: {
        fontSize: typography.fontSizes.md,
        fontWeight: typography.fontWeights.normal,
        color: colors.textSecondary,
    },
    radioOuter: {
        width: 30,
        height: 30,
        borderRadius: borderRadius.full,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: {
        borderColor: colors.primary,
    },
    radioInner: {
        width: 18,
        height: 18,
        borderRadius: borderRadius.full,
        backgroundColor: colors.primary,
    },
});

export default ObjectiveScreen;
