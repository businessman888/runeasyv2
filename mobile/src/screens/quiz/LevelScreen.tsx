import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    ScrollView,
} from 'react-native';
import { colors, typography, spacing } from '../../theme';
import Svg, { Path, Rect } from 'react-native-svg';

const { width } = Dimensions.get('window');

// Option Icons
const IconIniciante = () => (
    <Svg width={47} height={47} viewBox="0 0 47 47" fill="none">
        <Rect width={47} height={47} rx={10} fill="#15152A" />
        <Path d="M23 16.4C24.1587 16.4 25.1 15.4588 25.1 14.3C25.1 13.1413 24.1587 12.2 23 12.2C21.8412 12.2 20.9 13.1413 20.9 14.3C20.9 15.4588 21.8412 16.4 23 16.4ZM19.7525 21.9463L20.6 21.0988V23.6975C20.6 24.7475 21.0575 25.7488 21.8562 26.4313L24.5337 28.7263C24.755 28.9175 24.9012 29.18 24.9425 29.4688L25.415 32.7725C25.5087 33.4288 26.1163 33.8863 26.7725 33.7925C27.4288 33.6988 27.8862 33.0913 27.7925 32.435L27.32 29.1313C27.1962 28.265 26.7612 27.4775 26.0975 26.9075L24.8037 25.7975V21.4775L24.9462 21.6538C25.6287 22.5088 26.6637 23.0038 27.7587 23.0038H29.0037C29.6675 23.0038 30.2037 22.4675 30.2037 21.8038C30.2037 21.14 29.6675 20.6038 29.0037 20.6038H27.7587C27.395 20.6038 27.05 20.4388 26.8212 20.1538L26.15 19.3138C25.2875 18.2338 23.9788 17.6038 22.595 17.6038C21.3875 17.6038 20.2287 18.0838 19.3775 18.9388L18.0538 20.2475C17.3788 20.9225 17 21.8375 17 22.7938V24.2C17 24.8638 17.5362 25.4 18.2 25.4C18.8637 25.4 19.4 24.8638 19.4 24.2V22.7938C19.4 22.475 19.5275 22.1713 19.7525 21.9463ZM20.2175 28.6738C20.1612 28.8688 20.0562 29.0488 19.9137 29.1913L17.3525 31.7525C16.8837 32.2213 16.8837 32.9825 17.3525 33.4513C17.8212 33.92 18.5825 33.92 19.0512 33.4513L21.6125 30.89C22.0437 30.4588 22.3587 29.9225 22.5275 29.3338L22.61 29.0488L20.885 27.5713C20.7912 27.4888 20.6975 27.4063 20.6075 27.3163L20.2175 28.6738Z" fill="#EBEBF5" />
    </Svg>
);

const IconIntermediario = () => (
    <Svg width={47} height={47} viewBox="0 0 47 47" fill="none">
        <Rect width={47} height={47} rx={10} fill="#15152A" />
        <Path d="M26.2499 17.5C26.8466 17.5 27.4189 17.2629 27.8409 16.841C28.2628 16.419 28.4999 15.8467 28.4999 15.25C28.4999 14.6533 28.2628 14.081 27.8409 13.659C27.4189 13.2371 26.8466 13 26.2499 13C25.6532 13 25.0809 13.2371 24.6589 13.659C24.2369 14.081 23.9999 14.6533 23.9999 15.25C23.9999 15.8467 24.2369 16.419 24.6589 16.841C25.0809 17.2629 25.6532 17.5 26.2499 17.5ZM21.7299 19.641C21.1064 19.796 20.6809 20.029 20.3374 20.318C19.8224 20.752 19.4064 21.378 18.8444 22.362C18.7128 22.5923 18.4951 22.7608 18.2392 22.8306C17.9833 22.9004 17.7102 22.8656 17.4799 22.734C17.2496 22.6024 17.0811 22.3847 17.0113 22.1288C16.9415 21.8729 16.9763 21.5998 17.1079 21.3695C17.6674 20.391 18.2329 19.4755 19.0494 18.7885C19.9014 18.0705 20.9444 17.6645 22.3509 17.508C22.9389 17.443 23.5859 17.456 24.1924 17.7265C24.8289 18.011 25.2939 18.5205 25.6109 19.2015C26.0379 20.118 26.3554 20.6635 26.6094 20.98C26.7319 21.1315 26.8174 21.202 26.8659 21.2335C26.9044 21.2585 26.9209 21.2605 26.9269 21.2615C26.9704 21.2665 27.1119 21.2615 27.5259 21.078C27.7064 20.998 27.9034 20.902 28.1444 20.7845L28.2019 20.7565C28.4966 20.6111 28.794 20.4711 29.0939 20.3365C29.336 20.2302 29.6103 20.2241 29.8569 20.3196C30.1035 20.4151 30.3022 20.6043 30.4096 20.8459C30.517 21.0875 30.5244 21.3618 30.4301 21.6088C30.3358 21.8558 30.1475 22.0555 29.9064 22.164C29.6285 22.2887 29.3529 22.4185 29.0799 22.5535L29.0144 22.5855C28.7839 22.698 28.5519 22.8115 28.3344 22.9075C27.8844 23.1065 27.3094 23.3225 26.6859 23.247C26.0279 23.167 25.5209 22.7955 25.1034 22.297L23.7369 24.9335L25.6269 27.3925C25.7396 27.5393 25.8093 27.7144 25.8284 27.8985L26.2444 31.8965C26.2602 32.0282 26.2497 32.1618 26.2134 32.2894C26.1772 32.417 26.1159 32.5361 26.0331 32.6398C25.9503 32.7435 25.8477 32.8297 25.7313 32.8933C25.6149 32.957 25.487 32.9969 25.3551 33.0106C25.2231 33.0243 25.0897 33.0117 24.9627 32.9733C24.8357 32.935 24.7176 32.8718 24.6152 32.7874C24.5129 32.703 24.4284 32.599 24.3666 32.4816C24.3048 32.3642 24.267 32.2357 24.2554 32.1035L23.8684 28.387L22.7204 26.893L22.7104 26.9115L22.6684 26.8255L20.5474 24.0655C20.4431 23.9298 20.3754 23.7697 20.3507 23.6004C20.326 23.4311 20.3452 23.2583 20.4064 23.0985L21.7299 19.641Z" fill="#EBEBF5" />
        <Path d="M20.2158 25.5035L19.4798 27.4835L16.5798 27.2535C16.4479 27.2412 16.315 27.2553 16.1886 27.2949C16.0622 27.3344 15.945 27.3987 15.8436 27.4839C15.7423 27.5691 15.6589 27.6737 15.5983 27.7914C15.5376 27.9091 15.501 28.0377 15.4905 28.1697C15.4799 28.3017 15.4957 28.4345 15.5369 28.5603C15.5781 28.6861 15.6439 28.8026 15.7305 28.9028C15.817 29.003 15.9226 29.085 16.0411 29.1441C16.1596 29.2032 16.2886 29.2382 16.4208 29.247L20.0748 29.537C20.2916 29.5542 20.5082 29.5003 20.6916 29.3834C20.8751 29.2664 21.0154 29.0929 21.0913 28.889L21.6538 27.375L20.2158 25.5035Z" fill="#EBEBF5" />
    </Svg>
);

const IconAvancado = () => (
    <Svg width={47} height={47} viewBox="0 0 47 47" fill="none">
        <Rect width={47} height={47} rx={10} fill="#15152A" />
        <Path d="M19 33V31H23V27.9C22.1833 27.7167 21.4543 27.371 20.813 26.863C20.1717 26.355 19.7007 25.7173 19.4 24.95C18.15 24.8 17.1043 24.2543 16.263 23.313C15.4217 22.3717 15.0007 21.2673 15 20V19C15 18.45 15.196 17.9793 15.588 17.588C15.98 17.1967 16.4507 17.0007 17 17H19V15H29V17H31C31.55 17 32.021 17.196 32.413 17.588C32.805 17.98 33.0007 18.4507 33 19V20C33 21.2667 32.579 22.371 31.737 23.313C30.895 24.255 29.8493 24.8007 28.6 24.95C28.3 25.7167 27.8293 26.3543 27.188 26.863C26.5467 27.3717 25.8173 27.7173 25 27.9V31H29V33H19ZM19 22.8V19H17V20C17 20.6333 17.1833 21.2043 17.55 21.713C17.9167 22.2217 18.4 22.584 19 22.8ZM29 22.8C29.6 22.5833 30.0833 22.2207 30.45 21.712C30.8167 21.2033 31 20.6327 31 20V19H29V22.8Z" fill="#EBEBF5" />
    </Svg>
);



// Radio Button Component
const RadioButton = ({ selected }: { selected: boolean }) => (
    <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
    </View>
);

interface LevelOption {
    id: string;
    storeValue: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
}

const levels: LevelOption[] = [
    { id: 'iniciante', storeValue: 'beginner', icon: <IconIniciante />, title: 'Iniciante', subtitle: '0-6 meses de prática' },
    { id: 'intermediario', storeValue: 'intermediate', icon: <IconIntermediario />, title: 'Intermediário', subtitle: '6 meses - 2 anos' },
    { id: 'avancado', storeValue: 'advanced', icon: <IconAvancado />, title: 'Avançado', subtitle: 'Mais de 2 anos' },
];

interface LevelScreenProps {
    value?: string;
    onChange?: (value: string) => void;
}

export function LevelScreen({ value, onChange }: LevelScreenProps) {
    const [selectedLevel, setSelectedLevel] = useState<string | null>(
        value ? levels.find(l => l.storeValue === value)?.id || null : null
    );

    useEffect(() => {
        setSelectedLevel(value ? levels.find(l => l.storeValue === value)?.id || null : null);
    }, [value]);

    const handleSelect = (option: LevelOption) => {
        setSelectedLevel(option.id);
        if (onChange) {
            onChange(option.storeValue);
        }
    };

    return (
        <>
            {/* Title Section */}
            <View style={styles.titleContainer}>
                <Text style={styles.title}>Qual é o seu nível{'\n'}<Text style={styles.titleHighlight}>atual?</Text></Text>
                <Text style={styles.subtitle}>
                    Selecione a opção que melhor descreve{'\n'}ser histórico de treinos. Isso nos ajuda a{'\n'}calibrar a intensidade
                </Text>
            </View>

            {/* Options */}
            <View style={styles.optionsContainer}>
                {levels.map((option) => (
                    <TouchableOpacity
                        key={option.id}
                        style={[
                            styles.optionCard,
                            selectedLevel === option.id && styles.optionCardSelected
                        ]}
                        onPress={() => handleSelect(option)}
                        activeOpacity={0.7}
                    >
                        {option.icon}
                        <View style={styles.optionTextContainer}>
                            <Text style={styles.optionTitle}>{option.title}</Text>
                            <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                        </View>
                        <RadioButton selected={selectedLevel === option.id} />
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
        fontSize: 28,
        fontWeight: '700',
        color: colors.white,
        lineHeight: 36,
        marginBottom: 8,
    },
    titleHighlight: {
        color: '#00D4FF',
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
        padding: 12,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionCardSelected: {
        borderColor: '#00D4FF',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
    },
    optionTextContainer: {
        flex: 1,
        marginLeft: 12,
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
    radioOuter: {
        width: 30,
        height: 30,
        borderRadius: 80,
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: {
        borderColor: '#00D4FF',
    },
    radioInner: {
        width: 20,
        height: 20,
        borderRadius: 80,
        backgroundColor: '#00D4FF',
    },
});

export default LevelScreen;
