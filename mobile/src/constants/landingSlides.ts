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
    eyebrow?: string;
    title: string;
    subtitle?: string;
    image: ImageSourcePropType;
    imageMode: 'bleed' | 'contained';
    titleAlign: 'left' | 'center';
    titleTone: 'brand' | 'feature';
    /** Final visual scale used by the slow image approach animation. */
    imageScale: number;
    /** intrinsic width / height of the asset */
    aspectRatio: number;
};

export const LANDING_LOGO: ImageSourcePropType = require('../assets/images/lpLogoRuneasy.png');

export const LANDING_SLIDES: LandingSlide[] = [
    {
        key: 'badges',
        variant: 'logo',
        title: 'Seu melhor coach\nde corrida.',
        subtitle: 'Para todas as conquistas.\nEm qualquer distância.',
        image: require('../assets/images/imagesLP/imgOneCarrosselLPII.png'),
        imageMode: 'bleed',
        titleAlign: 'center',
        titleTone: 'brand',
        imageScale: 1,
        aspectRatio: 1500 / 1500,
    },
    {
        key: 'plan',
        variant: 'default',
        eyebrow: 'TREINO SOB MEDIDA',
        title: 'Um plano que evolui\njunto com você',
        subtitle: 'Treinos personalizados para sua rotina, objetivo e ritmo.',
        image: require('../assets/images/imagesLP/itemCarrosselTwoo.png'),
        imageMode: 'bleed',
        titleAlign: 'left',
        titleTone: 'feature',
        imageScale: 1.04,
        aspectRatio: 1500 / 1500,
    },
    {
        key: 'device',
        variant: 'default',
        eyebrow: 'SEMPRE COM VOCÊ',
        title: 'Seu coach no pulso,\nonde você estiver',
        subtitle: 'Conecte seus dispositivos e leve cada orientação para a corrida.',
        image: require('../assets/images/imagesLP/itemCarrosselThree.png'),
        imageMode: 'bleed',
        titleAlign: 'left',
        titleTone: 'feature',
        imageScale: 1.02,
        aspectRatio: 1500 / 1500,
    },
    {
        key: 'reports',
        variant: 'default',
        eyebrow: 'EVOLUÇÃO INTELIGENTE',
        title: 'Performance e saúde,\nlidas em conjunto',
        subtitle: 'Relatórios completos transformam seus dados em decisões melhores.',
        image: require('../assets/images/imagesLP/itemCarrosselFour.png'),
        imageMode: 'bleed',
        titleAlign: 'left',
        titleTone: 'feature',
        imageScale: 1.03,
        aspectRatio: 1500 / 1500,
    },
];

/** Duration each slide stays before auto-advancing (ms). */
export const SLIDE_DURATION = 4500;
