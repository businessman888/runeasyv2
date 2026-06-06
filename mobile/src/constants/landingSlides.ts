import { ImageSourcePropType } from 'react-native';

/**
 * Landing carousel (stories-style) slide configuration.
 *
 * Each slide is rendered as: optional logo → title (+ subtitle) → image.
 * Images have very different intrinsic aspect ratios, so we store the real
 * ratio here and size each image via `aspectRatio` to never distort them.
 *
 * `imageMode`:
 *  - 'bleed'     → full screen width, badges intentionally escape the edges
 *  - 'contained' → centered, capped by the stage height
 */
export type LandingSlide = {
    key: string;
    variant: 'logo' | 'default';
    title: string;
    subtitle?: string;
    image: ImageSourcePropType;
    imageMode: 'bleed' | 'contained';
    /** intrinsic width / height of the asset */
    aspectRatio: number;
};

export const LANDING_LOGO: ImageSourcePropType = require('../assets/images/lpLogoRuneasy.png');

export const LANDING_SLIDES: LandingSlide[] = [
    {
        key: 'badges',
        variant: 'logo',
        title: 'Seu melhor coach de corrida.',
        subtitle: 'Para todas as conquistas.\nEm qualquer distância.',
        image: require('../assets/images/imagesLP/imgOneCarrosselLPII.png'),
        imageMode: 'bleed',
        aspectRatio: 1500 / 1500,
    },
    {
        key: 'plan',
        variant: 'default',
        title: 'Tenha um plano de treino\npersonalizado para você',
        image: require('../assets/images/imagesLP/imgTwooCarrosselLP.png'),
        imageMode: 'contained',
        aspectRatio: 516 / 352,
    },
    {
        key: 'device',
        variant: 'default',
        title: 'Conecte ao seu dispositivo e\ntenha seu coach com você 24h por dia',
        image: require('../assets/images/imagesLP/imgItemCarrosselLPThreeII.png'),
        imageMode: 'contained',
        aspectRatio: 1703 / 2008,
    },
    {
        key: 'reports',
        variant: 'default',
        title: 'Receba relatórios completos do coach\ncom base na sua performance × saúde',
        image: require('../assets/images/imagesLP/imgFourCarrosselLP.png'),
        imageMode: 'contained',
        aspectRatio: 457 / 729,
    },
];

/** Duration each slide stays before auto-advancing (ms). */
export const SLIDE_DURATION = 4500;
