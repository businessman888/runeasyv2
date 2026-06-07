import React, { memo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    ImageBackground,
    ImageSourcePropType,
    Dimensions,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Carousel from 'react-native-reanimated-carousel';
import { fonts, colors } from '../../theme';
import { InterstitialBase } from './_InterstitialBase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// O conteúdo do step é renderizado dentro do ScrollView do OnboardingScreen, que
// aplica paddingHorizontal: 20. O carrossel "quebra" essa margem (margin -20) para
// ficar full-bleed e mostrar o peek do próximo card.
const SCREEN_PADDING = 20;
const ITEM_WIDTH = SCREEN_WIDTH - 48; // 24px de peek de cada lado
const CARD_GAP = 8;
const CARD_HEIGHT = 380;

const CYAN = colors.primary;
const TEXT = '#EBEBF5';
const TEXT_DIM = 'rgba(235, 235, 245, 0.6)';

const ANDROID_BLUR_METHOD: 'dimezisBlurView' | undefined =
    Platform.OS === 'android' ? 'dimezisBlurView' : undefined;

interface Testimonial {
    id: string;
    name: string;
    age: number;
    avatar: ImageSourcePropType;
    background: ImageSourcePropType;
    quote: string;
}

const TESTIMONIALS: Testimonial[] = [
    {
        id: 'pedro',
        name: 'Pedro',
        age: 34,
        avatar: require('../../assets/images/testemonials/pedro/avatar.jpg'),
        background: require('../../assets/images/testemonials/pedro/background.jpg'),
        quote:
            'A sensação de abrir um app de corrida e ver 6 dias de treino por semana quando você mal consegue sair cedo antes das crianças acordarem é desanimadora. Com a Runeasy pela primeira vez um plano respeitou o que eu tenho — não o que eu deveria ter. Isso fez toda diferença.',
    },
    {
        id: 'camila',
        name: 'Camila',
        age: 28,
        avatar: require('../../assets/images/testemonials/camila/avatar.jpg'),
        background: require('../../assets/images/testemonials/camila/background.jpg'),
        quote:
            'Fui numa corrida de rua assistir uma amiga e fiquei com uma mistura de vontade e vergonha. "Isso não é pra mim." Três meses depois eu estava na linha de chegada daquela mesma corrida. O plano começou do zero de verdade — sem presumir que eu já sabia alguma coisa.',
    },
    {
        id: 'rodrigo',
        name: 'Rodrigo',
        age: 41,
        avatar: require('../../assets/images/testemonials/rodrigo/avatar.jpg'),
        background: require('../../assets/images/testemonials/rodrigo/background.jpg'),
        quote:
            'Uma lesão no joelho me tirou de ação por 8 meses. Quando tentei voltar por conta, exagerei na segunda semana e fiquei mais 3 meses parado. Com a Runeasy fui honesto sobre minha limitação e o plano foi absurdamente respeitoso com isso. Sem pressa. Voltei aos 21km sem uma dor sequer.',
    },
    {
        id: 'ana_paula',
        name: 'Ana Paula',
        age: 37,
        avatar: require('../../assets/images/testemonials/ana_paula/avatar.jpg'),
        background: require('../../assets/images/testemonials/ana_paula/background.jpg'),
        quote:
            '35 Km de treino longo e eu lembrei das outras vezes que havia desistido nesse ponto. Mas dessa vez meu corpo estava diferente — o Coach AI tinha me preparado exatamente para aquela sensação. Sabia o que estava vindo e sabia como atravessar. A maratona foi a consequência, não o milagre.',
    },
    {
        id: 'lucas',
        name: 'Lucas',
        age: 25,
        avatar: require('../../assets/images/testemonials/lucas/avatar.jpg'),
        background: require('../../assets/images/testemonials/lucas/background.jpg'),
        quote:
            'O que me prendia era a sensação de estar sempre no começo. Cada vez que parava e voltava parecia que era do zero. A Runeasy foi o primeiro app que fez eu sentir progresso mesmo quando o treino era leve. Ver meu histórico crescendo foi o que me manteve.',
    },
    {
        id: 'fernanda',
        name: 'Fernanda',
        age: 32,
        avatar: require('../../assets/images/testemonials/fernanda/avatar.jpg'),
        background: require('../../assets/images/testemonials/fernanda/background.jpg'),
        quote:
            'Cruzar a linha de chegada da Meia Maratona do Rio foi a coisa mais difícil e mais orgulhosa da minha vida. Não porque foi fácil — porque não foi. Mas porque eu sabia que cada treino das últimas 14 semanas estava me construindo para aquele momento. A Runeasy não me prometeu que ia ser tranquilo. Me preparou para o que não seria.',
    },
];

const pillsImage = require('../../assets/images/testemonials/pills/pillsImages.png');

const TestimonialCard = memo(({ item }: { item: Testimonial }) => (
    <View style={styles.cardWrapper}>
        <ImageBackground source={item.background} style={styles.cardImage} imageStyle={styles.cardImageRadius}>
            <LinearGradient
                colors={['rgba(10,10,24,0.15)', 'rgba(10,10,24,0.35)', 'rgba(10,10,24,0.85)']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
            />

            {/* Container glass no rodapé do card */}
            <View style={styles.glass}>
                <BlurView
                    intensity={28}
                    tint="dark"
                    experimentalBlurMethod={ANDROID_BLUR_METHOD}
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                />
                <View style={[StyleSheet.absoluteFill, styles.glassVeil]} pointerEvents="none" />

                <View style={styles.glassHeader}>
                    <Image source={item.avatar} style={styles.avatar} />
                    <View style={styles.glassHeaderText}>
                        <View style={styles.nameRow}>
                            <Text style={styles.name} numberOfLines={1}>
                                {item.name}
                            </Text>
                            <Ionicons name="checkmark-circle" size={16} color={CYAN} />
                        </View>
                        <Text style={styles.age}>{item.age} anos</Text>
                    </View>
                </View>

                <Text style={styles.quote}>{`“${item.quote}”`}</Text>
            </View>
        </ImageBackground>
    </View>
));
TestimonialCard.displayName = 'TestimonialCard';

export function TestimonialsScreen() {
    const renderItem = useCallback(
        ({ item }: { item: Testimonial }) => <TestimonialCard item={item} />,
        [],
    );

    return (
        <InterstitialBase
            titleAlign="center"
            title="Junte-se a milhares de atletas que alavancaram suas metas e alcançaram níveis "
            titleHighlight="extraordinários"
        >
            {/* Card de "louros" com borda cyan suave */}
            <View style={styles.laurelCard}>
                <Ionicons name="leaf-outline" size={34} color={CYAN} />
                <Text style={styles.laurelText}>
                    Milhares{'\n'}de atletas com 100%{'\n'}de desempenho{' '}
                    <Text style={styles.laurelHighlight}>melhorado</Text>
                </Text>
                <Ionicons name="leaf-outline" size={34} color={CYAN} style={styles.leafMirror} />
            </View>

            {/* Pills de avatares */}
            <Image source={pillsImage} style={styles.pills} resizeMode="contain" />

            {/* Carrossel de testemunhos (full-bleed, quebra o padding do ScrollView) */}
            <View style={styles.carouselWrapper}>
                <Carousel
                    width={ITEM_WIDTH}
                    height={CARD_HEIGHT}
                    style={{ width: SCREEN_WIDTH }}
                    data={TESTIMONIALS}
                    loop
                    renderItem={renderItem}
                />
            </View>
        </InterstitialBase>
    );
}

const styles = StyleSheet.create({
    // Laurel card
    laurelCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        borderWidth: 1,
        borderColor: colors.proGlassBorderCyan,
        borderRadius: 16,
        backgroundColor: 'rgba(0, 212, 255, 0.04)',
        paddingVertical: 18,
        paddingHorizontal: 12,
        marginTop: 8,
    },
    laurelText: {
        fontFamily: fonts.bold,
        fontSize: 16,
        lineHeight: 22,
        textAlign: 'center',
        color: TEXT,
    },
    laurelHighlight: {
        color: CYAN,
    },
    leafMirror: {
        transform: [{ scaleX: -1 }],
    },

    // Pills
    pills: {
        alignSelf: 'center',
        width: 150,
        height: 56,
        marginTop: 24,
    },

    // Carousel
    carouselWrapper: {
        marginTop: 24,
        marginHorizontal: -SCREEN_PADDING, // full-bleed dentro do ScrollView padded
        alignItems: 'center',
    },
    cardWrapper: {
        flex: 1,
        paddingHorizontal: CARD_GAP,
    },
    cardImage: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    cardImageRadius: {
        borderRadius: 16,
    },

    // Glass footer
    glass: {
        margin: 12,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.proGlassBorder,
        padding: 14,
    },
    glassVeil: {
        backgroundColor: 'rgba(14, 14, 30, 0.35)',
    },
    glassHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    glassHeaderText: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    name: {
        fontFamily: fonts.semibold,
        fontSize: 16,
        color: TEXT,
    },
    age: {
        fontFamily: fonts.regular,
        fontSize: 12,
        color: TEXT_DIM,
        marginTop: 2,
    },
    quote: {
        fontFamily: fonts.regular,
        fontSize: 13,
        lineHeight: 19,
        color: 'rgba(235, 235, 245, 0.85)',
    },
});

export default TestimonialsScreen;
