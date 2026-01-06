import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../theme';
import { ScreenContainer } from '../components/ScreenContainer';

// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function SearchIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="search-outline" size={size} color={color} />;
}

function ContaIcon({ size = 27, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="person-outline" size={size} color={color} />;
}

function PagamentosIcon({ size = 27, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="card-outline" size={size} color={color} />;
}

function IADadosIcon({ size = 27, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="brain" size={size} color={color} />;
}

function TreinosIcon({ size = 27, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="sync-outline" size={size} color={color} />;
}

function ChevronDownIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-down" size={size} color={color} />;
}

function ChatIcon({ size = 20, color = '#0A0A18' }: { size?: number; color?: string }) {
    return <Ionicons name="chatbubbles-outline" size={size} color={color} />;
}

interface Category {
    id: string;
    title: string;
    iconName: string;
    iconType: 'ionicons' | 'material';
}

interface FAQ {
    id: string;
    question: string;
    answer: string;
}

const categories: Category[] = [
    { id: 'conta', title: 'Conta', iconName: 'person-outline', iconType: 'ionicons' },
    { id: 'pagamentos', title: 'Pagamentos', iconName: 'card-outline', iconType: 'ionicons' },
    { id: 'ia_dados', title: 'IA & Dados', iconName: 'brain', iconType: 'material' },
    { id: 'treinos', title: 'Treinos', iconName: 'sync-outline', iconType: 'ionicons' },
];

const faqs: FAQ[] = [
    {
        id: '1',
        question: 'Como a IA calcula minha prontidão?',
        answer: 'A IA analisa diversos fatores como qualidade do sono, carga de treino recente, variabilidade da frequência cardíaca e seu histórico de performance para calcular sua prontidão diária.',
    },
    {
        id: '2',
        question: 'Meu treino do Strava não apareceu',
        answer: 'Verifique se sua conta do Strava está conectada corretamente. Pode haver um atraso de alguns minutos na sincronização. Tente atualizar a página ou reconectar sua conta.',
    },
    {
        id: '3',
        question: 'Posso alterar meu plano a qualquer momento?',
        answer: 'Sim! Você pode alterar seu plano de treino a qualquer momento através das configurações. A IA irá recalcular automaticamente suas sessões futuras.',
    },
];

const renderCategoryIcon = (category: Category) => {
    if (category.iconType === 'material') {
        return <MaterialCommunityIcons name={category.iconName as any} size={27} color="#00D4FF" />;
    }
    return <Ionicons name={category.iconName as any} size={27} color="#00D4FF" />;
};

export function HelpScreen({ navigation }: any) {
    const [searchQuery, setSearchQuery] = useState('');
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
                    <BackIcon size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Ajuda</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <SearchIcon size={20} color="#00D4FF" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Como podemos ajudar?"
                        placeholderTextColor="rgba(235,235,245,0.4)"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>

                {/* Categories */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Categorias</Text>
                    <View style={styles.categoriesGrid}>
                        {categories.map((category) => (
                            <TouchableOpacity
                                key={category.id}
                                style={styles.categoryCard}
                                activeOpacity={0.7}
                            >
                                <View style={styles.categoryIconContainer}>
                                    {renderCategoryIcon(category)}
                                </View>
                                <Text style={styles.categoryTitle}>{category.title}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

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
                                        <ChevronDownIcon size={20} color="#00D4FF" />
                                    </View>
                                </View>
                                {expandedFaq === faq.id && (
                                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Support Section */}
                <View style={styles.supportSection}>
                    <Text style={styles.supportTitle}>Ainda precisa de ajuda?</Text>
                    <Text style={styles.supportDescription}>
                        Nossa equipe de suporte está pronta para te atender.
                    </Text>
                    <TouchableOpacity style={styles.supportButton} activeOpacity={0.8}>
                        <ChatIcon size={18} color="#0A0A18" />
                        <Text style={styles.supportButtonText}>Falar com Suporte</Text>
                    </TouchableOpacity>
                </View>

                {/* Bottom padding for BottomBar clearance */}
                <View style={styles.bottomSpacer} />
            </ScrollView>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
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
        color: '#FFFFFF',
    },
    headerSpacer: {
        width: 40,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: spacing.lg,
    },
    // Search
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        paddingHorizontal: spacing.md,
        height: 48,
        gap: spacing.sm,
        marginBottom: spacing.xl,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#FFFFFF',
    },
    // Sections
    section: {
        marginBottom: spacing.xl,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: spacing.md,
    },
    // Categories
    categoriesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
    },
    categoryCard: {
        width: '47%',
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(235,235,245,0.1)',
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.md,
        alignItems: 'center',
    },
    categoryIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(0,212,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    categoryTitle: {
        fontSize: 14,
        fontWeight: '500',
        color: '#FFFFFF',
    },
    // FAQs
    faqContainer: {
        gap: spacing.sm,
    },
    faqCard: {
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(235,235,245,0.1)',
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
        color: '#FFFFFF',
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
        color: 'rgba(235,235,245,0.6)',
        marginTop: spacing.sm,
        lineHeight: 20,
    },
    // Support Section
    supportSection: {
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(235,235,245,0.1)',
        padding: spacing.lg,
        alignItems: 'center',
    },
    supportTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: spacing.xs,
    },
    supportDescription: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(235,235,245,0.6)',
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    supportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00D4FF',
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: spacing.xl,
        gap: spacing.sm,
        width: '100%',
    },
    supportButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0A0A18',
    },
    bottomSpacer: {
        height: 120,
    },
});
