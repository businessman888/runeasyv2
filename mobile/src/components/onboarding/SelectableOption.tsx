/**
 * The single selectable option row used by every onboarding option screen.
 *
 * Standardizes (per the UI audit): one radio bullet always on the right, one
 * icon box (Ionicons), one spacing, one card style. Wraps the existing
 * OptionCard so the pulse-on-select / press-scale animation is preserved.
 *
 * Lists must set their own container `gap: QUIZ.gapOptions` — this component
 * carries NO marginBottom (that was the source of the doubled spacing).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OptionCard } from './OptionCard';
import { QUIZ } from '../../screens/quiz/_tokens';
import type { IoniconName } from '../../screens/quiz/_icons';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const Radio = ({ selected }: { selected: boolean }) => (
    <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
    </View>
);

interface SelectableOptionProps {
    title: string;
    subtitle?: string;
    selected: boolean;
    onPress: () => void;
    icon?: IoniconName;
    disabled?: boolean;
}

export function SelectableOption({
    title,
    subtitle,
    selected,
    onPress,
    icon,
    disabled,
}: SelectableOptionProps) {
    // Tablet: opção vira coluna centralizada e capada (não estica a tela).
    const { isTablet } = useBreakpoint();
    return (
        <OptionCard
            selected={selected}
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
            style={[styles.card, isTablet && styles.cardTablet]}
            selectedStyle={styles.cardSelected}
        >
            {icon ? (
                <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
                    <Ionicons
                        name={icon}
                        size={24}
                        color={selected ? QUIZ.color.cyan : QUIZ.color.text}
                    />
                </View>
            ) : null}

            <View style={styles.textWrap}>
                <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            <Radio selected={selected} />
        </OptionCard>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: QUIZ.color.card,
        borderRadius: QUIZ.card.radius,
        padding: QUIZ.card.padding,
        borderWidth: QUIZ.card.borderWidth,
        borderColor: 'transparent',
        gap: 12,
    },
    cardSelected: {
        borderColor: QUIZ.color.cyan,
        backgroundColor: QUIZ.color.selectedFill,
    },
    // Tablet: centraliza e limita a largura da opção.
    cardTablet: {
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
    },
    iconBox: {
        width: QUIZ.iconBox.size,
        height: QUIZ.iconBox.size,
        borderRadius: QUIZ.iconBox.radius,
        backgroundColor: 'rgba(235, 235, 245, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconBoxSelected: {
        backgroundColor: 'rgba(0, 212, 255, 0.15)',
    },
    textWrap: {
        flex: 1,
    },
    title: {
        fontFamily: QUIZ.optionTitle.fontFamily,
        fontSize: QUIZ.optionTitle.fontSize,
        color: QUIZ.color.text,
        marginBottom: 2,
    },
    titleSelected: {
        color: QUIZ.color.cyan,
    },
    subtitle: {
        fontFamily: QUIZ.optionSubtitle.fontFamily,
        fontSize: QUIZ.optionSubtitle.fontSize,
        color: QUIZ.color.textDim,
    },
    radioOuter: {
        width: QUIZ.bullet.size,
        height: QUIZ.bullet.size,
        borderRadius: QUIZ.bullet.size / 2,
        borderWidth: 2,
        borderColor: QUIZ.color.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: {
        borderColor: QUIZ.color.cyan,
    },
    radioInner: {
        width: QUIZ.bullet.dot,
        height: QUIZ.bullet.dot,
        borderRadius: QUIZ.bullet.dot / 2,
        backgroundColor: QUIZ.color.cyan,
    },
});

export default SelectableOption;
