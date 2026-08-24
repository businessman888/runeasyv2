import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, createThemeStyles, useThemeSubscription } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { ScreenContainer } from '../components/ScreenContainer';

// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = semanticColors.textPrimary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function ChevronDownIcon({ size = 20, color = semanticColors.accent }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="chevron-down" size={size} color={color} />;
}

function ChatIcon({ size = 20, color = semanticColors.textOnAccent }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="chatbubbles-outline" size={size} color={color} />;
}

function ExternalLinkIcon({ size = 18, color = semanticColors.textTertiary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="open-outline" size={size} color={color} />;
}

interface FAQ {
    id: string;
    question: string;
    answer: string;
}

const faqs: FAQ[] = [
    {
        id: '1',
        question: 'Como a IA calcula minha prontidão?',
        answer: 'A IA analisa diversos fatores como qualidade do sono, carga de treino recente, variabilidade da frequência cardíaca e seu histórico de performance para calcular sua prontidão diária.',
    },
    {
        id: '2',
        question: 'Meu treino não apareceu no app',
        answer: 'Pode haver um atraso de alguns minutos na sincronização dos dados. Tente atualizar a página ou verificar sua conexão com a internet.',
    },
    {
        id: '3',
        question: 'Posso alterar meu plano a qualquer momento?',
        answer: 'Sim! Você pode alterar seu plano de treino a qualquer momento através das configurações. A IA irá recalcular automaticamente suas sessões futuras.',
    },
];

export function HelpScreen({ navigation }: any) {
    useThemeSubscription();
    const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

    const toggleFaq = (id: string) => {
        setExpandedFaq(expandedFaq === id ? null : id);
    };

    return (
        <ScreenContainer>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <BackIcon size={24} color={semanticColors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Ajuda</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* FAQs */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Dúvidas frequentes</Text>
                    <View style={styles.faqContainer}>
                        {faqs.map((faq) => (
                            <TouchableOpacity
                                key={faq.id}
                                style={styles.faqCard}
                                onPress={() => toggleFaq(faq.id)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.faqHeader}>
                                    <Text style={styles.faqQuestion}>{faq.question}</Text>
                                    <View style={[
                                        styles.chevronContainer,
                                        expandedFaq === faq.id && styles.chevronRotated
                                    ]}>
                                        <ChevronDownIcon size={20} color={semanticColors.accent} />
                                    </View>
                                </View>
                                {expandedFaq === faq.id && (
                                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Legal Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Legal</Text>
                    <View style={styles.legalCard}>
                        <TouchableOpacity
                            style={styles.legalItem}
                            activeOpacity={0.7}
                            onPress={() => Linking.openURL('https://runeasy.com.br/privacidade.html')}
                            accessibilityRole="button"
                            accessibilityLabel="Abrir Política de Privacidade"
                        >
                            <View style={styles.legalItemLeft}>
                                <View style={styles.legalIconContainer}>
                                    <Ionicons name="shield-checkmark-outline" size={20} color={semanticColors.accent} />
                                </View>
                                <Text style={styles.legalItemText}>Política de Privacidade</Text>
                            </View>
                            <ExternalLinkIcon />
                        </TouchableOpacity>

                        <View style={styles.legalDivider} />

                        <TouchableOpacity
                            style={styles.legalItem}
                            activeOpacity={0.7}
                            onPress={() => Linking.openURL('https://runeasy.com.br/termos.html')}
                            accessibilityRole="button"
                            accessibilityLabel="Abrir Termos de Uso"
                        >
                            <View style={styles.legalItemLeft}>
                                <View style={styles.legalIconContainer}>
                                    <Ionicons name="document-text-outline" size={20} color={semanticColors.accent} />
                                </View>
                                <Text style={styles.legalItemText}>Termos de Uso</Text>
                            </View>
                            <ExternalLinkIcon />
                        </TouchableOpacity>

                        <View style={styles.legalDivider} />

                        <TouchableOpacity
                            style={styles.legalItem}
                            activeOpacity={0.7}
                            onPress={() => Linking.openURL('https://runeasy.com.br/sobre.html')}
                            accessibilityRole="button"
                            accessibilityLabel="Abrir página Sobre"
                        >
                            <View style={styles.legalItemLeft}>
                                <View style={styles.legalIconContainer}>
                                    <Ionicons name="information-circle-outline" size={20} color={semanticColors.accent} />
                                </View>
                                <Text style={styles.legalItemText}>Sobre</Text>
                            </View>
                            <ExternalLinkIcon />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Support Section */}
                <View style={styles.supportSection}>
                    <Text style={styles.supportTitle}>Ainda precisa de ajuda?</Text>
                    <Text style={styles.supportDescription}>
                        Nossa equipe de suporte está pronta para te atender.
                    </Text>
                    <TouchableOpacity
                        style={styles.supportButton}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Support')}
                        accessibilityRole="button"
                        accessibilityLabel="Falar com Suporte"
                    >
                        <ChatIcon size={18} color={semanticColors.textOnAccent} />
                        <Text style={styles.supportButtonText}>Falar com Suporte</Text>
                    </TouchableOpacity>
                </View>

                {/* Bottom padding for BottomBar clearance */}
                <View style={styles.bottomSpacer} />
            </ScrollView>
        </ScreenContainer>
    );
}

const styles = createThemeStyles(() => ({
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
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: semanticColors.textPrimary,
    },
    headerSpacer: {
        width: 40,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
    },
    // Sections
    section: {
        marginBottom: spacing.xl,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: semanticColors.textPrimary,
        marginBottom: spacing.md,
    },
    // FAQs
    faqContainer: {
        gap: spacing.sm,
    },
    faqCard: {
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
    },
    faqHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    faqQuestion: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
        color: semanticColors.textPrimary,
        marginRight: spacing.sm,
    },
    chevronContainer: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chevronRotated: {
        transform: [{ rotate: '180deg' }],
    },
    faqAnswer: {
        fontSize: 13,
        fontWeight: '400',
        color: semanticColors.textSecondary,
        marginTop: spacing.sm,
        lineHeight: 20,
    },
    // Legal Section
    legalCard: {
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        overflow: 'hidden',
    },
    legalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: spacing.md,
    },
    legalItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    legalIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: semanticColors.accentSubtle,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    legalItemText: {
        fontSize: 15,
        fontWeight: '500',
        color: semanticColors.textPrimary,
    },
    legalDivider: {
        height: 1,
        backgroundColor: semanticColors.glass,
        marginLeft: 60,
    },
    // Support Section
    supportSection: {
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
        padding: spacing.lg,
        alignItems: 'center',
    },
    supportTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: semanticColors.textPrimary,
        marginBottom: spacing.xs,
    },
    supportDescription: {
        fontSize: 13,
        fontWeight: '400',
        color: semanticColors.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    supportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: semanticColors.accent,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: spacing.xl,
        gap: spacing.sm,
        width: '100%',
    },
    supportButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: semanticColors.textOnAccent,
    },
    bottomSpacer: {
        height: 120,
    },
}));
