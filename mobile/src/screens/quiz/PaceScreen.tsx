import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    TextInput,
    ScrollView,
    KeyboardAvoidingView,
} from 'react-native';
import { colors, typography, spacing } from '../../theme';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

const { width } = Dimensions.get('window');

// No Injury Icon (Happy face) - dynamic color based on selection
const NoInjuryIcon = ({ selected }: { selected: boolean }) => (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
        <Path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M40 20C40 14.6957 37.8929 9.60859 34.1421 5.85786C30.3914 2.10714 25.3043 0 20 0C14.6957 0 9.60859 2.10714 5.85786 5.85786C2.10714 9.60859 0 14.6957 0 20C0 25.3043 2.10714 30.3914 5.85786 34.1421C9.60859 37.8929 14.6957 40 20 40C25.3043 40 30.3914 37.8929 34.1421 34.1421C37.8929 30.3914 40 25.3043 40 20ZM29.8286 14.1486C29.8286 15.7629 28.5229 17.0714 26.9086 17.0743H26.9029C26.1423 17.0517 25.4204 16.7339 24.8901 16.1883C24.3597 15.6428 24.0625 14.9122 24.0614 14.1513C24.0603 13.3904 24.3553 12.659 24.8841 12.1118C25.4129 11.5647 26.1338 11.2449 26.8943 11.22H26.9029C28.5171 11.22 29.8286 12.5314 29.8286 14.1486ZM16.0257 14.1486C16.0257 15.7629 14.72 17.0714 13.1057 17.0743H13.0971C12.3366 17.0513 11.6149 16.7332 11.0848 16.1873C10.5547 15.6415 10.2579 14.9108 10.2571 14.1499C10.2564 13.389 10.5518 12.6577 11.0808 12.1109C11.6099 11.564 12.3309 11.2445 13.0914 11.22H13.0971C14.7143 11.22 16.0257 12.5314 16.0257 14.1486ZM11.9686 22.1714C11.9152 21.937 11.8151 21.7157 11.6742 21.5209C11.5332 21.3261 11.3544 21.1618 11.1484 21.0377C10.9424 20.9137 10.7135 20.8326 10.4754 20.7992C10.2373 20.7658 9.99487 20.7808 9.76271 20.8434C9.53055 20.906 9.31341 21.0148 9.12433 21.1633C8.93524 21.3118 8.77809 21.497 8.66231 21.7077C8.54653 21.9184 8.4745 22.1504 8.45053 22.3896C8.42657 22.6289 8.45117 22.8705 8.52286 23.1C9.2045 25.6239 10.6987 27.8528 12.7743 29.4423C14.85 31.0317 17.3914 31.893 20.0057 31.893C22.62 31.893 25.1615 31.0317 27.2371 29.4423C29.3128 27.8528 30.8069 25.6239 31.4886 23.1C31.5506 22.8732 31.5673 22.6364 31.5376 22.4032C31.5079 22.17 31.4325 21.9449 31.3156 21.7409C31.1987 21.5369 31.0426 21.358 30.8564 21.2144C30.6702 21.0709 30.4575 20.9655 30.2305 20.9044C30.0034 20.8433 29.7666 20.8276 29.5335 20.8582C29.3004 20.8888 29.0756 20.9652 28.8721 21.0829C28.6685 21.2007 28.4903 21.3574 28.3475 21.5442C28.2047 21.731 28.1002 21.9442 28.04 22.1714C27.5626 23.9369 26.517 25.4959 25.0647 26.6076C23.6125 27.7193 21.8346 28.3217 20.0057 28.3217C18.1768 28.3217 16.3989 27.7193 14.9467 26.6076C13.4945 25.4959 12.446 23.9369 11.9686 22.1714Z"
            fill={selected ? "#00D4FF" : "rgba(235, 235, 245, 0.6)"}
        />
    </Svg>
);

// Has Injury Icon (Bandaid) - dynamic color based on selection
const HasInjuryIcon = ({ selected }: { selected: boolean }) => (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
        <Path
            d="M6.62719 19.1147L22.8522 2.85469C24.7334 1.01277 27.2651 -0.0129572 29.8979 0.000123592C32.5307 0.0132043 35.0521 1.06403 36.9149 2.92456C38.7777 4.78508 39.8317 7.30518 39.848 9.93794C39.8644 12.5707 38.8418 15.1037 37.0022 16.9872L33.3097 20.8097L20.7947 33.3247L16.9872 37.0047C15.1037 38.8443 12.5707 39.8669 9.93794 39.8505C7.30518 39.8342 4.78508 38.7802 2.92456 36.9174C1.06403 35.0546 0.0132043 32.5332 0.000123592 29.9004C-0.0129572 27.2676 1.01277 24.7359 2.85469 22.8547L2.85719 22.8497L6.61969 19.1197L6.62219 19.1147H6.62719ZM20.9022 11.9697C20.7861 11.8535 20.6483 11.7612 20.4966 11.6983C20.3449 11.6353 20.1823 11.6029 20.0181 11.6027C19.8538 11.6026 19.6912 11.6349 19.5394 11.6976C19.3876 11.7604 19.2497 11.8524 19.1334 11.9684C19.0172 12.0845 18.925 12.2223 18.862 12.374C18.7991 12.5257 18.7666 12.6883 18.7665 12.8526C18.7664 13.0168 18.7986 13.1795 18.8614 13.3312C18.9241 13.483 19.0161 13.621 19.1322 13.7372C19.3679 13.9649 19.6837 14.0909 20.0114 14.088C20.3392 14.0852 20.6527 13.9537 20.8845 13.722C21.1162 13.4902 21.2477 13.1767 21.2505 12.8489C21.2534 12.5212 21.1274 12.2054 20.8997 11.9697H20.9022ZM17.3622 17.2722C17.4816 17.1569 17.5768 17.0189 17.6423 16.8664C17.7078 16.7139 17.7423 16.5499 17.7438 16.3839C17.7452 16.218 17.7136 16.0534 17.6507 15.8997C17.5879 15.7461 17.495 15.6066 17.3777 15.4892C17.2603 15.3718 17.1208 15.279 16.9671 15.2162C16.8135 15.1533 16.6489 15.1217 16.4829 15.1231C16.317 15.1246 16.1529 15.159 16.0004 15.2246C15.8479 15.2901 15.71 15.3853 15.5947 15.5047C15.367 15.7404 15.241 16.0562 15.2438 16.3839C15.2467 16.7117 15.3782 17.0252 15.6099 17.257C15.8417 17.4887 16.1552 17.6202 16.4829 17.623C16.8107 17.6259 17.1264 17.4999 17.3622 17.2722ZM13.8272 20.8097C14.0619 20.5753 14.1939 20.2573 14.1941 19.9256C14.1944 19.5939 14.0628 19.2757 13.8284 19.0409C13.5941 18.8062 13.276 18.6742 12.9443 18.674C12.6126 18.6738 12.2944 18.8053 12.0597 19.0397C11.9435 19.1557 11.8512 19.2936 11.7883 19.4453C11.7253 19.5969 11.6929 19.7596 11.6927 19.9238C11.6925 20.2555 11.8241 20.5737 12.0584 20.8084C12.2928 21.0432 12.6109 21.1751 12.9426 21.1754C13.2743 21.1756 13.5925 21.0441 13.8272 20.8097ZM20.8972 27.8797C21.0166 27.7644 21.1118 27.6264 21.1773 27.4739C21.2428 27.3214 21.2773 27.1574 21.2788 26.9914C21.2802 26.8255 21.2486 26.6609 21.1857 26.5072C21.1229 26.3536 21.03 26.2141 20.9127 26.0967C20.7953 25.9793 20.6558 25.8865 20.5021 25.8237C20.3485 25.7608 20.1839 25.7292 20.0179 25.7306C19.852 25.7321 19.6879 25.7666 19.5354 25.8321C19.3829 25.8976 19.245 25.9928 19.1297 26.1122C18.902 26.3479 18.776 26.6637 18.7788 26.9914C18.7817 27.3192 18.9132 27.6327 19.1449 27.8645C19.3767 28.0962 19.6902 28.2277 20.0179 28.2305C20.3457 28.2334 20.6614 28.1074 20.8972 27.8797ZM24.4322 22.5772C24.3169 22.4578 24.1789 22.3626 24.0264 22.2971C23.8739 22.2315 23.7099 22.1971 23.5439 22.1956C23.378 22.1942 23.2134 22.2258 23.0597 22.2887C22.9061 22.3515 22.7666 22.4443 22.6492 22.5617C22.5318 22.6791 22.439 22.8186 22.3762 22.9722C22.3133 23.1259 22.2817 23.2905 22.2831 23.4564C22.2846 23.6224 22.3191 23.7864 22.3846 23.9389C22.4501 24.0914 22.5453 24.2294 22.6647 24.3447C22.9004 24.5724 23.2162 24.6984 23.5439 24.6955C23.8717 24.6927 24.1852 24.5612 24.417 24.3295C24.6487 24.0977 24.7802 23.7842 24.783 23.4564C24.7859 23.1287 24.6599 22.8129 24.4322 22.5772ZM27.9672 20.8097C28.0867 20.6945 28.1821 20.5568 28.2479 20.4043C28.3136 20.2519 28.3483 20.088 28.35 19.922C28.3516 19.756 28.3202 19.5914 28.2576 19.4377C28.195 19.284 28.1023 19.1443 27.9852 19.0268C27.868 18.9092 27.7285 18.8162 27.575 18.7532C27.4215 18.6901 27.2569 18.6582 27.091 18.6594C26.925 18.6606 26.7609 18.6949 26.6083 18.7602C26.4557 18.8255 26.3177 18.9205 26.2022 19.0397C25.9675 19.2741 25.8355 19.5921 25.8352 19.9238C25.835 20.2555 25.9666 20.5737 26.2009 20.8084C26.4353 21.0432 26.7534 21.1751 27.0851 21.1754C27.4168 21.1756 27.735 21.0441 27.9697 20.8097H27.9672ZM17.3622 22.5772C17.2469 22.4578 17.1089 22.3626 16.9564 22.2971C16.8039 22.2315 16.6399 22.1971 16.4739 22.1956C16.308 22.1942 16.1434 22.2258 15.9897 22.2887C15.8361 22.3515 15.6966 22.4443 15.5792 22.5617C15.4618 22.6791 15.369 22.8186 15.3062 22.9722C15.2433 23.1259 15.2117 23.2905 15.2131 23.4564C15.2146 23.6224 15.2491 23.7864 15.3146 23.9389C15.3801 24.0914 15.4753 24.2294 15.5947 24.3447C15.8304 24.5724 16.1462 24.6984 16.4739 24.6955C16.8017 24.6927 17.1152 24.5612 17.347 24.3295C17.5787 24.0977 17.7102 23.7842 17.713 23.4564C17.7159 23.1287 17.5899 22.8129 17.3622 22.5772ZM20.8972 20.8097C21.0134 20.6936 21.1056 20.5558 21.1686 20.4041C21.2316 20.2524 21.264 20.0898 21.2641 19.9256C21.2642 19.7613 21.232 19.5987 21.1693 19.4469C21.1065 19.2951 21.0145 19.1572 20.8984 19.0409C20.7824 18.9247 20.6446 18.8325 20.4929 18.7695C20.3412 18.7066 20.1786 18.6741 20.0143 18.674C19.8501 18.6739 19.6874 18.7061 19.5356 18.7689C19.3839 18.8316 19.2459 18.9236 19.1297 19.0397C18.895 19.2741 18.763 19.5921 18.7627 19.9238C18.7625 20.2555 18.8941 20.5737 19.1284 20.8084C19.3628 21.0432 19.6809 21.1751 20.0126 21.1754C20.3443 21.1756 20.6625 21.0441 20.8972 20.8097ZM24.4322 15.5047C24.3169 15.3853 24.1789 15.2901 24.0264 15.2246C23.8739 15.159 23.7099 15.1246 23.5439 15.1231C23.378 15.1217 23.2134 15.1533 23.0597 15.2162C22.9061 15.279 22.7666 15.3718 22.6492 15.4892C22.5318 15.6066 22.439 15.7461 22.3762 15.8997C22.3133 16.0534 22.2817 16.218 22.2831 16.3839C22.2846 16.5499 22.3191 16.7139 22.3846 16.8664C22.4501 17.0189 22.5453 17.1569 22.6647 17.2722C22.9004 17.4999 23.2162 17.6259 23.5439 17.623C23.8717 17.6202 24.1852 17.4887 24.417 17.257C24.6487 17.0252 24.7802 16.7117 24.783 16.3839C24.7859 16.0562 24.6599 15.7404 24.4322 15.5047ZM21.5422 8.30969L31.5422 18.3097L33.3122 16.5397L23.3122 6.53969L21.5422 8.30969ZM18.3122 31.5397L8.31219 21.5397L6.54219 23.3097L16.5422 33.3097L18.3122 31.5397Z"
            fill={selected ? "#00D4FF" : "rgba(235, 235, 245, 0.6)"}
        />
    </Svg>
);



interface PaceScreenProps {
    hasInjury?: boolean;
    injuryDetails?: string;
    onChange?: (data: { hasInjury: boolean; injuryDetails: string }) => void;
}

export function PaceScreen({ hasInjury: initialHasInjury, injuryDetails: initialInjuryDetails, onChange }: PaceScreenProps) {
    const [hasInjury, setHasInjury] = useState<boolean | null>(initialHasInjury ?? null);
    const [injuryDetails, setInjuryDetails] = useState<string>(initialInjuryDetails || '');

    useEffect(() => {
        setHasInjury(initialHasInjury ?? null);
        setInjuryDetails(initialInjuryDetails || '');
    }, [initialHasInjury, initialInjuryDetails]);

    const handleSelectNo = () => {
        const newHasInjury = false;
        const newInjuryDetails = '';
        setHasInjury(newHasInjury);
        setInjuryDetails(newInjuryDetails);
        if (onChange) {
            onChange({ hasInjury: newHasInjury, injuryDetails: newInjuryDetails });
        }
    };

    const handleSelectYes = () => {
        const newHasInjury = true;
        setHasInjury(newHasInjury);
        if (onChange) {
            onChange({ hasInjury: newHasInjury, injuryDetails });
        }
    };

    const handleInjuryDetailsChange = (text: string) => {
        setInjuryDetails(text);
        if (onChange && hasInjury === true) {
            onChange({ hasInjury: true, injuryDetails: text });
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.content}>
                    {/* Title Section */}
                    <View style={styles.titleContainer}>
                        <Text style={styles.title}>
                            Você possui alguma <Text style={styles.titleHighlight}>lesão{'\n'}atual</Text> ou limitação física?
                        </Text>
                        <Text style={styles.subtitle}>
                            Isso ajuda a nossa IA a adaptar o seu plano{'\n'}de treino para evitar riscos de agravamento.
                        </Text>
                    </View>

                    {/* Yes/No Toggle Buttons */}
                    <View style={styles.toggleContainer}>
                        <TouchableOpacity
                            style={[
                                styles.toggleButton,
                                hasInjury === false && styles.toggleButtonSelected
                            ]}
                            onPress={handleSelectNo}
                            activeOpacity={0.7}
                        >
                            <NoInjuryIcon selected={hasInjury === false} />
                            <Text style={[
                                styles.toggleText,
                                hasInjury === false && styles.toggleTextSelected
                            ]}>Não</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.toggleButton,
                                hasInjury === true && styles.toggleButtonSelected
                            ]}
                            onPress={handleSelectYes}
                            activeOpacity={0.7}
                        >
                            <HasInjuryIcon selected={hasInjury === true} />
                            <Text style={[
                                styles.toggleText,
                                hasInjury === true && styles.toggleTextSelected
                            ]}>Sim</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Injury Details Section */}
                    <View style={styles.detailsSection}>
                        <View style={styles.detailsHeader}>
                            <Text style={styles.detailsTitle}>Detalhes da Lesão</Text>
                            <View style={styles.optionalBadge}>
                                <Text style={styles.optionalText}>Opcional</Text>
                            </View>
                        </View>

                        <View style={styles.textInputContainer}>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Descreva sua lesão (ex: dor no joelho esquerdo ao correr, tendinite no tornozelo...)"
                                placeholderTextColor="rgba(235, 235, 245, 0.6)"
                                multiline
                                numberOfLines={6}
                                textAlignVertical="top"
                                value={injuryDetails}
                                onChangeText={handleInjuryDetailsChange}
                                editable={hasInjury === true}
                            />
                        </View>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
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
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    progressContainer: {
        marginBottom: 32,
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
    titleHighlight: {
        color: '#00D4FF',
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '400',
        color: 'rgba(235, 235, 245, 0.6)',
        lineHeight: 22,
    },
    toggleContainer: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 32,
    },
    toggleButton: {
        flex: 1,
        backgroundColor: '#15152A',
        borderRadius: 16,
        paddingVertical: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    toggleButtonSelected: {
        borderColor: '#00D4FF',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
    },
    toggleText: {
        fontSize: 17,
        fontWeight: '600',
        color: 'rgba(235, 235, 245, 0.6)',
        marginTop: 12,
    },
    toggleTextSelected: {
        color: colors.white,
    },
    detailsSection: {
        marginBottom: 24,
    },
    detailsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    detailsTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#00D4FF',
    },
    optionalBadge: {
        marginLeft: 12,
        backgroundColor: 'rgba(235, 235, 245, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
    },
    optionalText: {
        fontSize: 11,
        fontWeight: '500',
        color: 'rgba(235, 235, 245, 0.6)',
    },
    textInputContainer: {
        borderWidth: 1,
        borderColor: 'rgba(235, 235, 245, 0.1)',
        borderRadius: 20,
        overflow: 'hidden',
    },
    textInput: {
        padding: 20,
        fontSize: 14,
        fontWeight: '400',
        color: colors.white,
        minHeight: 150,
    },
    nextButtonContainer: {
        position: 'absolute',
        bottom: 30,
        right: 20,
    },
    nextButton: {
        borderRadius: 27,
    },
});

export default PaceScreen;
