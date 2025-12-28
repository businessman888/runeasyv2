import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../theme';
import { useGamificationStore } from '../stores';

// SVG Icons
function BackIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>←</Text>;
}

function BoltIcon({ size = 20, color = '#00FF88' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>⚡</Text>;
}

function FireIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M12 23C16.1421 23 19.5 19.6421 19.5 15.5C19.5 14.6345 19.2697 13.8032 19 13C19 14.6569 17.6569 16 16 16C14.3431 16 13 14.6569 13 13C13 11.3431 14.3431 10 16 10C16 6 12 2 12 2C12 2 8 6.5 8 11C8 11.5 8.02222 11.9889 8.06544 12.4652C7.4151 11.8508 7 10.9724 7 10C5.5 11.5 4.5 13.5 4.5 15.5C4.5 19.6421 7.85786 23 12 23Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🔥</Text>;
}

function TrophyIcon({ size = 24, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 1.69003C12.0008 1.56816 11.9565 1.4503 11.8756 1.35911C11.7948 1.26793 11.6831 1.20984 11.562 1.19603C9.19455 0.934169 6.80545 0.934169 4.438 1.19603C4.31709 1.20982 4.20552 1.26776 4.12469 1.35874C4.04386 1.44972 3.99946 1.56733 4 1.68903V2.25603C3.18933 2.3607 2.38833 2.49603 1.597 2.66203C1.43199 2.69682 1.28353 2.78621 1.17557 2.91575C1.06761 3.0453 1.00647 3.20745 1.002 3.37603L1 3.50003C0.999879 4.66778 1.45371 5.78986 2.26561 6.62919C3.07751 7.46852 4.18388 7.95936 5.351 7.99803C5.82386 8.41603 6.38892 8.71621 7 8.87403V10H6C5.73478 10 5.48043 10.1054 5.29289 10.2929C5.10536 10.4805 5 10.7348 5 11V13H4.333C3.597 13 3 13.597 3 14.333C3 14.701 3.298 15 3.667 15H12.333C12.5099 15 12.6796 14.9298 12.8046 14.8047C12.9297 14.6796 13 14.5099 13 14.333C13 13.597 12.403 13 11.667 13H11V11C11 10.7348 10.8946 10.4805 10.7071 10.2929C10.5196 10.1054 10.2652 10 10 10H9V8.87403C9.61108 8.71621 10.1761 8.41603 10.649 7.99803C11.8377 7.95884 12.9625 7.45066 13.7777 6.58457C14.5928 5.71848 15.0319 4.56492 14.999 3.37603C14.9945 3.20732 14.9332 3.04506 14.825 2.91549C14.7169 2.78592 14.5682 2.69662 14.403 2.66203C13.6076 2.49525 12.806 2.35981 12 2.25603V1.69003ZM4 3.76803C3.51 3.8347 3.024 3.91303 2.542 4.00303C2.62185 4.47231 2.81222 4.91585 3.09739 5.297C3.38256 5.67816 3.75434 5.98598 4.182 6.19503C4.06115 5.80822 3.99978 5.40528 4 5.00003V3.76803ZM12 3.76803C12.49 3.8347 12.976 3.91303 13.458 4.00303C13.3782 4.47231 13.1878 4.91585 12.9026 5.297C12.6174 5.67816 12.2457 5.98598 11.818 6.19503C11.936 5.81803 12 5.41603 12 5.00003V3.76803Z" fill={color} />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏆</Text>;
}

// Badge Icons from Figma Design
function LendaUrbanaIcon({ size = 65 }: { size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 71 71" fill="none">
                <g filter="url(#filter0_lenda)">
                    <rect x="3" y="3" width="65" height="65" rx="32.5" fill="#0E0E1F" />
                    <g filter="url(#filter1_lenda)">
                        <rect x="8" y="8" width="55" height="55" rx="27.5" fill="#0E0E1F" />
                        <path d="M28.4281 21.7477C28.3203 21.8133 28.3812 27.4688 28.4492 27.5836C28.5336 27.7266 29.6469 28.7649 30.6383 29.6297C31.4141 30.3047 32.0984 29.8313 32.2273 29.8313C32.5203 29.8313 37.4422 29.8852 37.5898 29.8852C37.6508 29.8852 38.5227 30.3938 39.2562 29.7703C40.2992 28.8797 41.5531 27.7617 41.5742 27.5977C41.5953 27.4383 41.5977 21.818 41.5203 21.7688C41.4852 21.7453 40.5969 21.7313 39.357 21.7172C38.3023 21.7055 36.1531 22.2469 34.782 22.2422C33.0242 22.2375 32.0187 21.6891 30.65 21.7008C29.3961 21.7102 28.468 21.7219 28.4281 21.7477Z" fill="#176BC6" />
                        <path d="M30.6453 21.6937L30.6383 29.6297C30.6383 29.6297 31.0227 29.9719 31.4094 30.2883C31.775 30.5883 32.143 30.8625 32.1711 30.8601C32.4266 30.8414 37.7399 30.9726 37.85 30.9187C37.911 30.8883 38.3071 30.5765 38.6797 30.2695C38.968 30.0305 39.261 29.7773 39.261 29.7773L39.3664 21.7125C39.3664 21.7125 38.7008 21.7101 37.8289 21.7031C37.8242 21.7031 35.6586 21.9562 34.8383 21.9586C33.8539 21.9609 32.9539 21.6867 32.0867 21.6867C31.0836 21.6867 30.6453 21.6937 30.6453 21.6937Z" fill="white" />
                        <path d="M32.1453 30.8672C31.9977 30.757 32.0844 21.6867 32.0844 21.6867C32.0844 21.6867 33.0547 21.675 35.1149 21.6844C36.9102 21.6914 37.8289 21.7031 37.8289 21.7031C37.8289 21.7031 37.9133 30.7594 37.8219 30.907C37.7305 31.0547 36.2281 31.8047 35.2016 31.8211C34.175 31.8375 32.218 30.9234 32.1453 30.8672Z" fill="#DB0D2A" />
                        <path d="M35.0586 33.3141C35.5461 33.2859 37.9321 30.9797 37.8875 30.9047C37.8571 30.8531 36.4367 30.8461 35.0024 30.8391C33.568 30.832 32.1266 30.8016 32.1196 30.8531C32.1078 30.9539 34.4586 33.3492 35.0586 33.3141Z" fill="#FBC21F" />
                        <path d="M34.9976 32.9109C34.8359 32.9109 34.7258 33.2156 34.6297 33.4219C34.5336 33.6281 32.1125 39.0305 32.082 39.0797C32.0492 39.1266 26.6094 39.1758 26.3539 39.2086C26.0984 39.2414 25.9109 39.3352 25.9109 39.4477C25.9109 39.5602 25.8758 39.7899 26.0187 39.9C26.1617 40.0125 30.5703 43.6594 30.5703 43.7391C30.5703 43.8188 29.1312 49.5867 29.1476 49.7156C29.1641 49.8445 29.2461 49.9805 29.3422 50.0602C29.4383 50.1399 29.5039 50.1375 29.6656 50.1024C29.968 50.0367 34.7351 47.1094 34.8008 47.1258C34.8641 47.1422 39.7648 50.0227 39.8914 50.0391C40.0203 50.0555 40.1633 50.0391 40.257 49.9734C40.3508 49.9078 40.4469 49.657 40.3976 49.4813C40.3508 49.3055 39.3617 44.2219 39.3945 44.1258C39.4273 44.0297 43.6297 40.4016 43.7094 40.2422C43.7891 40.0828 43.6367 39.7078 43.4937 39.5953C43.3508 39.4828 37.9531 39.0984 37.8406 39.0352C37.7281 38.9719 35.4922 33.4711 35.4617 33.3586C35.4312 33.2461 35.1734 32.9109 34.9976 32.9109Z" fill="#FBC21F" />
                        <path d="M32.7617 39.1102C32.7617 39.232 34.2805 42.2578 34.3766 42.2578C34.4727 42.2578 35.0469 42.0188 35.0469 42.0188C35.0469 42.0188 35.0633 34.2375 35.0141 34.3172C34.9672 34.3969 32.7617 38.8547 32.7617 39.1102ZM35.9258 42.3234C35.8648 42.2484 37.332 39.8789 37.5242 39.7992C37.7164 39.7195 42.8774 40.0219 42.8609 40.1344C42.8445 40.2445 35.9891 42.4031 35.9258 42.3234ZM31.1797 43.8258C31.1024 43.8938 29.9656 48.668 30.0289 48.7781C30.0922 48.8906 34.2477 43.8727 34.2313 43.7766C34.2149 43.6805 34.2477 42.7852 34.2477 42.7852C34.2477 42.7852 31.3063 43.7133 31.1797 43.8258Z" fill="#FDEFAA" />
                        <path d="M35.4734 42.0211C35.457 41.9719 35.3188 41.3321 35.2859 41.161C35.2531 40.9992 35.1406 40.8211 34.9789 40.8211C34.8242 40.8211 34.707 40.9875 34.6555 41.2102C34.5828 41.5172 34.4703 42.0211 34.4703 42.0211C34.4703 42.0211 33.8703 41.9696 33.7344 41.9649C33.5234 41.9578 33.2727 41.9719 33.2328 42.1594C33.207 42.2742 33.2445 42.4266 33.5563 42.6211C33.8164 42.7828 34.1234 42.961 34.1234 42.961C34.1234 42.961 34.032 43.3008 33.9617 43.6078C33.9219 43.786 33.8234 44.1188 33.9945 44.2078C34.1633 44.2969 34.3602 44.1516 34.5523 43.9641L34.9648 43.568C34.9648 43.568 35.3258 43.8422 35.4617 43.9524C35.6258 44.086 35.8836 44.1703 36.0125 44.0578C36.1508 43.936 36.1203 43.7344 36.0453 43.5141C35.9633 43.2797 35.8016 42.9305 35.8016 42.9305C35.8016 42.9305 36.3594 42.5789 36.4625 42.5063C36.568 42.4336 36.6898 42.2625 36.6172 42.0774C36.568 41.9508 36.357 41.9063 36.1789 41.9391C36.0008 41.9719 35.4734 42.0211 35.4734 42.0211ZM37.2828 41.8735C37.3625 42.1571 37.6438 42.1008 38.143 41.9742C38.6398 41.85 43.3461 40.3992 43.5055 40.3453C43.6789 40.2867 43.9461 40.0852 43.8664 39.8485C43.7867 39.6094 43.5383 39.5531 43.2547 39.6211C42.9711 39.6891 38.3 41.2617 37.993 41.3742C37.7938 41.4492 37.2031 41.5899 37.2828 41.8735ZM35.0094 40.0102C35.3023 39.9774 35.2813 39.3539 35.3211 38.843C35.3609 38.3321 35.4313 33.3375 35.4313 33.1688C35.4313 32.986 35.3211 32.693 35.0703 32.693C34.8195 32.693 34.6906 32.8852 34.6648 33.1735C34.6391 33.4641 34.6625 38.4399 34.6813 38.7633C34.7141 39.2789 34.7305 40.043 35.0094 40.0102ZM32.4875 41.8172C32.5602 41.5336 31.9953 41.3297 31.5219 41.1328C31.0484 40.9336 26.593 39.3516 26.4313 39.2977C26.2578 39.2414 25.9648 39.2438 25.8852 39.4805C25.8055 39.7196 25.9297 39.9094 26.1969 40.0266C26.4641 40.1438 30.8961 41.6555 31.2102 41.7399C31.7094 41.8711 32.4125 42.1102 32.4875 41.8172ZM33.6102 44.6672C33.3594 44.5125 32.9914 44.911 32.6445 45.2907C32.2977 45.6703 29.3398 49.3875 29.2344 49.5211C29.1219 49.6664 29.0094 49.9828 29.2086 50.1352C29.4055 50.2899 29.6445 50.1985 29.8438 49.9852C30.043 49.7719 32.9398 46.0781 33.1227 45.8086C33.4133 45.3844 33.8492 44.8149 33.6102 44.6672ZM36.3805 44.5875C36.1602 44.7821 36.493 45.1805 36.7555 45.6211C37.018 46.0617 39.6055 49.7602 39.7039 49.8985C39.8094 50.0485 40.0789 50.2477 40.2852 50.1024C40.4914 49.9571 40.4727 49.7039 40.3273 49.4532C40.182 49.2024 37.475 45.4946 37.2711 45.2414C36.9453 44.8407 36.5914 44.4024 36.3805 44.5875Z" fill="#F6922C" />
                    </g>
                </g>
                <defs>
                    <filter id="filter0_lenda" x="0" y="0" width="71" height="71" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                        <feOffset />
                        <feGaussianBlur stdDeviation="1.5" />
                        <feComposite in2="hardAlpha" operator="out" />
                        <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 0.768627 0 0 0 0 0 0 0 0 0.3 0" />
                        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                    </filter>
                    <filter id="filter1_lenda" x="6" y="6" width="59" height="59" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                        <feOffset />
                        <feGaussianBlur stdDeviation="1" />
                        <feComposite in2="hardAlpha" operator="out" />
                        <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 0.768627 0 0 0 0 0 0 0 0 0.3 0" />
                        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                    </filter>
                </defs>
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏅</Text>;
}

function VelocistaIcon({ size = 65 }: { size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 71 71" fill="none">
                <g filter="url(#filter0_velocista)">
                    <rect x="3" y="3" width="65" height="65" rx="32.5" fill="#0E0E1F" />
                    <g filter="url(#filter1_velocista)">
                        <rect x="8" y="8" width="55" height="55" rx="27.5" fill="#0E0E1F" />
                        <path d="M46.0003 31.6476C45.962 31.5896 45.9112 31.5408 45.8517 31.5048C45.7921 31.4688 45.7253 31.4465 45.6561 31.4396C45.5868 31.4326 45.5169 31.4412 45.4514 31.4646C45.3859 31.488 45.3264 31.5257 45.2773 31.575L36.439 40.4133C36.2601 40.5722 36.0272 40.6568 35.788 40.6496C35.5488 40.6424 35.3214 40.544 35.1524 40.3745C34.9834 40.2051 34.8856 39.9774 34.8791 39.7382C34.8725 39.499 34.9577 39.2663 35.1171 39.0879L45.9804 28.2258C46.0675 28.1387 46.1366 28.0352 46.1837 27.9214C46.2309 27.8076 46.2551 27.6857 46.2551 27.5625C46.2551 27.4393 46.2309 27.3173 46.1837 27.2035C46.1366 27.0897 46.0675 26.9863 45.9804 26.8992C45.8933 26.8121 45.7899 26.743 45.6761 26.6959C45.5623 26.6487 45.4403 26.6245 45.3171 26.6245C45.1939 26.6245 45.072 26.6487 44.9582 26.6959C44.8444 26.743 44.741 26.8121 44.6538 26.8992L43.0859 28.4683C40.8482 26.7207 38.1043 25.7454 35.2656 25.6888C32.4268 25.6321 29.6462 26.4971 27.3406 28.1541C25.0349 29.811 23.3285 32.1707 22.477 34.8793C21.6256 37.5879 21.675 40.4996 22.6179 43.1777C22.7471 43.5449 22.9868 43.8631 23.304 44.0887C23.6213 44.3142 24.0005 44.4361 24.3898 44.4375H45.6089C45.9978 44.4377 46.3771 44.317 46.6943 44.0922C47.0116 43.8673 47.2511 43.5494 47.3796 43.1824C48.0479 41.2824 48.271 39.2544 48.0319 37.2546C47.7928 35.2547 47.0977 33.3365 46.0003 31.6476ZM26.7312 40.5011C26.7806 40.7448 26.7312 40.9981 26.5938 41.2054C26.4565 41.4126 26.2424 41.5568 25.9988 41.6062C25.9371 41.6188 25.8742 41.625 25.8113 41.625C25.5952 41.6247 25.3858 41.5498 25.2186 41.4129C25.0514 41.276 24.9366 41.0856 24.8937 40.8738C24.5584 39.2235 24.6322 37.5163 25.1084 35.901C25.5846 34.2858 26.4489 32.8116 27.6259 31.6072C28.8028 30.4027 30.2566 29.5046 31.8604 28.9912C33.4642 28.4778 35.1693 28.3647 36.8269 28.6617C37.0716 28.7055 37.289 28.8448 37.4311 29.0488C37.5731 29.2529 37.6283 29.505 37.5845 29.7498C37.5407 29.9945 37.4014 30.2119 37.1974 30.3539C36.9933 30.496 36.7412 30.5512 36.4964 30.5074C35.14 30.2646 33.7447 30.3573 32.4324 30.7776C31.12 31.1978 29.9305 31.9328 28.9674 32.9184C28.0043 33.904 27.2971 35.1102 26.9073 36.432C26.5175 37.7537 26.457 39.1507 26.7312 40.5011Z" fill="url(#paint0_velocista)" />
                    </g>
                </g>
                <defs>
                    <filter id="filter0_velocista" x="0" y="0" width="71" height="71" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                        <feOffset />
                        <feGaussianBlur stdDeviation="1.5" />
                        <feComposite in2="hardAlpha" operator="out" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0.498824 0 0 0 0 0.6 0 0 0 0.3 0" />
                        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                    </filter>
                    <filter id="filter1_velocista" x="6" y="6" width="59" height="59" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                        <feOffset />
                        <feGaussianBlur stdDeviation="1" />
                        <feComposite in2="hardAlpha" operator="out" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0.498824 0 0 0 0 0.6 0 0 0 0.5 0" />
                        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                    </filter>
                    <linearGradient id="paint0_velocista" x1="34.9988" y1="25.6862" x2="34.9988" y2="44.4375" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#00D4FF" />
                        <stop offset="1" stopColor="#007F99" />
                    </linearGradient>
                </defs>
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>⏱️</Text>;
}

function MadrugadorIcon({ size = 65 }: { size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 71 71" fill="none">
                <g filter="url(#filter0_madrugador)">
                    <rect x="3" y="3" width="65" height="65" rx="32.5" fill="#0E0E1F" />
                    <g filter="url(#filter1_madrugador)">
                        <rect x="8" y="8" width="55" height="55" rx="27.5" fill="#0E0E1F" />
                        <path d="M23.699 39.375C22.8642 37.5005 22.8082 35.371 23.5434 33.4552C24.2786 31.5394 25.7447 29.9941 27.6193 29.1593C29.4938 28.3244 31.6232 28.2684 33.5391 29.0036C35.4549 29.7388 37.0002 31.205 37.835 33.0795L39.671 37.203L42.167 39.6315C42.2985 39.7597 42.3967 39.9182 42.4528 40.093C42.509 40.2679 42.5215 40.4538 42.4893 40.6347C42.457 40.8155 42.381 40.9856 42.2678 41.1303C42.1546 41.2749 42.0078 41.3897 41.84 41.4645L27.2495 47.961C27.0817 48.0356 26.8981 48.068 26.7148 48.0552C26.5315 48.0425 26.3542 47.9851 26.1982 47.8881C26.0422 47.791 25.9124 47.6572 25.8201 47.4984C25.7278 47.3396 25.6757 47.1606 25.6685 46.977L25.5335 43.497L23.699 39.375ZM33.245 47.0055C33.5369 47.4462 33.9756 47.7692 34.4832 47.9171C34.9907 48.065 35.5342 48.0282 36.0172 47.8133C36.5002 47.5983 36.8913 47.2191 37.1211 46.7431C37.351 46.267 37.4046 45.7249 37.2725 45.213L33.245 47.0055ZM38.129 28.092C38.2405 27.9274 38.4127 27.8137 38.6079 27.776C38.8031 27.7383 39.0053 27.7797 39.17 27.891C41.582 29.5185 43.2425 31.848 43.502 34.527C43.526 34.767 43.538 35.0105 43.538 35.2575C43.538 35.4564 43.459 35.6472 43.3184 35.7878C43.1777 35.9285 42.9869 36.0075 42.788 36.0075C42.5891 36.0075 42.3984 35.9285 42.2577 35.7878C42.117 35.6472 42.038 35.4564 42.038 35.2575C42.0376 35.0621 42.0275 34.8669 42.008 34.6725C41.804 32.5455 40.472 30.5805 38.33 29.133C38.1654 29.0216 38.0517 28.8493 38.0141 28.6541C37.9764 28.4589 38.0177 28.2567 38.129 28.092ZM38.864 24.3645C38.9155 24.2804 38.983 24.2074 39.0628 24.1494C39.1425 24.0915 39.2329 24.0498 39.3287 24.0268C39.4246 24.0039 39.524 24 39.6214 24.0155C39.7187 24.0309 39.812 24.0654 39.896 24.117C43.583 26.376 46.766 29.8245 47 35.973C47.0076 36.1719 46.9358 36.3657 46.8005 36.5117C46.6652 36.6577 46.4774 36.7439 46.2785 36.7515C46.0796 36.7591 45.8859 36.6873 45.7399 36.552C45.5939 36.4167 45.5076 36.2289 45.5 36.03C45.29 30.516 42.5 27.471 39.1115 25.395C38.9422 25.2911 38.821 25.1242 38.7746 24.931C38.7282 24.7377 38.7604 24.534 38.864 24.3645Z" fill="url(#paint0_madrugador)" />
                    </g>
                </g>
                <defs>
                    <filter id="filter0_madrugador" x="0" y="0" width="71" height="71" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                        <feOffset />
                        <feGaussianBlur stdDeviation="1.5" />
                        <feComposite in2="hardAlpha" operator="out" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0.196078 0 0 0 0 0.803922 0 0 0 0 0.196078 0 0 0 0.2 0" />
                        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                    </filter>
                    <filter id="filter1_madrugador" x="6" y="6" width="59" height="59" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                        <feOffset />
                        <feGaussianBlur stdDeviation="1" />
                        <feComposite in2="hardAlpha" operator="out" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0.196078 0 0 0 0 0.803922 0 0 0 0 0.196078 0 0 0 0.2 0" />
                        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                    </filter>
                    <linearGradient id="paint0_madrugador" x1="35.0152" y1="24.0062" x2="35.0152" y2="48.0579" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#32CD32" />
                        <stop offset="1" stopColor="#196719" />
                    </linearGradient>
                </defs>
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🌅</Text>;
}

function ImparavelIcon({ size = 65 }: { size?: number }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 71 71" fill="none">
                <g filter="url(#filter0_imparavel)">
                    <rect x="3" y="3" width="65" height="65" rx="32.5" fill="#0E0E1F" />
                    <g filter="url(#filter1_imparavel)">
                        <rect x="8" y="8" width="55" height="55" rx="27.5" fill="#0E0E1F" />
                        <path d="M36.8023 23.0918C36.6868 22.9957 36.5498 22.9288 36.403 22.8968C36.2561 22.8647 36.1037 22.8684 35.9586 22.9076C35.8135 22.9468 35.68 23.0203 35.5692 23.1219C35.4585 23.2235 35.3738 23.3502 35.3223 23.4914L32.7441 30.5707L29.9129 27.8273C29.8178 27.7351 29.7043 27.6641 29.5797 27.6189C29.4552 27.5738 29.3225 27.5555 29.1904 27.5654C29.0583 27.5753 28.9298 27.613 28.8134 27.6761C28.6969 27.7392 28.5952 27.8263 28.5148 27.9316C25.9766 31.2574 24.6875 34.6031 24.6875 37.875C24.6875 40.61 25.774 43.2331 27.708 45.167C29.6419 47.101 32.265 48.1875 35 48.1875C37.735 48.1875 40.3581 47.101 42.292 45.167C44.226 43.2331 45.3125 40.61 45.3125 37.875C45.3125 30.9082 39.3605 25.2187 36.8023 23.0918ZM41.5496 38.9695C41.3065 40.3274 40.6532 41.5782 39.6777 42.5535C38.7022 43.5288 37.4513 44.1818 36.0934 44.4246C36.0419 44.4334 35.9897 44.4377 35.9375 44.4375C35.7023 44.4374 35.4758 44.349 35.3028 44.1897C35.1298 44.0304 35.0229 43.812 35.0035 43.5776C34.984 43.3433 35.0533 43.1101 35.1977 42.9245C35.342 42.7389 35.5509 42.6142 35.7828 42.5754C37.7246 42.2484 39.3723 40.6008 39.7016 38.6555C39.7432 38.4102 39.8806 38.1916 40.0834 38.0477C40.2863 37.9037 40.538 37.8462 40.7832 37.8879C41.0284 37.9295 41.2471 38.0669 41.391 38.2697C41.535 38.4726 41.5924 38.7243 41.5508 38.9695H41.5496Z" fill="url(#paint0_imparavel)" />
                    </g>
                </g>
                <defs>
                    <filter id="filter0_imparavel" x="0" y="0" width="71" height="71" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                        <feOffset />
                        <feGaussianBlur stdDeviation="1.5" />
                        <feComposite in2="hardAlpha" operator="out" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0.388235 0 0 0 0 0.4 0 0 0 0 0.945098 0 0 0 0.3 0" />
                        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                    </filter>
                    <filter id="filter1_imparavel" x="6" y="6" width="59" height="59" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                        <feOffset />
                        <feGaussianBlur stdDeviation="1" />
                        <feComposite in2="hardAlpha" operator="out" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0.388235 0 0 0 0 0.4 0 0 0 0 0.945098 0 0 0 0.5 0" />
                        <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                        <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
                    </filter>
                    <linearGradient id="paint0_imparavel" x1="35" y1="22.8752" x2="35" y2="48.1875" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#9747FF" />
                        <stop offset="1" stopColor="#5B2B99" />
                    </linearGradient>
                </defs>
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🔥</Text>;
}

function LockIcon({ size = 24, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11" stroke={color} strokeWidth="2" fill="none" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🔒</Text>;
}

function MountainIcon({ size = 32, color = 'rgba(235,235,245,0.3)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill={color}>
                <path d="M24 8L4 40H44L24 8Z" />
                <path d="M36 20L28 40H44L36 20Z" fill="rgba(235,235,245,0.2)" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🏔️</Text>;
}

function CrownIcon({ size = 32, color = 'rgba(235,235,245,0.3)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill={color}>
                <path d="M6 38V14L16 24L24 8L32 24L42 14V38H6Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>👑</Text>;
}

function SecretIcon({ size = 32, color = 'rgba(235,235,245,0.3)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 48 48" fill={color}>
                <circle cx="24" cy="18" r="8" />
                <path d="M12 40V36C12 32 16 28 24 28C32 28 36 32 36 36V40" />
                <rect x="20" y="12" width="8" height="4" fill="rgba(0,0,0,0.5)" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size }}>🕵️</Text>;
}

export function BadgesScreen({ navigation }: any) {
    const { badges, stats, fetchBadges, fetchStats, isLoading } = useGamificationStore();

    React.useEffect(() => {
        fetchBadges();
        fetchStats();
    }, []);

    // Map badge names to display info (using REAL names from database)
    const getBadgeDisplayInfo = (badge: any) => {
        const nameMap: Record<string, { name: string, stat: string, statColor: string, icon: string }> = {
            // Milestone badges
            'Primeiro Passo': {
                name: 'PRIMEIRO PASSO',
                stat: '1° TREINO',
                statColor: '#FFD700',
                icon: 'medal'
            },
            'Maratonista': {
                name: 'MARATONISTA',
                stat: '> 21KM',
                statColor: '#FFD700',
                icon: 'medal'
            },

            // Performance badges
            'Velocista I': {
                name: 'VELOCISTA I',
                stat: 'PACE < 5:30"',
                statColor: '#00D4FF',
                icon: 'speedometer'
            },
            'Velocista II': {
                name: 'VELOCISTA II',
                stat: 'PACE < 5:00"',
                statColor: '#00D4FF',
                icon: 'speedometer'
            },
            'Superação': {
                name: 'SUPERAÇÃO',
                stat: '+5% MELHORA',
                statColor: '#9747FF',
                icon: 'flame'
            },

            // Consistency badges
            'Consistente': {
                name: 'CONSISTENTE',
                stat: '12 TREINOS/30D',
                statColor: '#32CD32',
                icon: 'sun'
            },
            'Semana Completa': {
                name: 'SEMANA COMPLETA',
                stat: 'TODOS TREINOS',
                statColor: '#32CD32',
                icon: 'sun'
            },

            // Streak badges
            'Chama Eterna': {
                name: 'CHAMA ETERNA',
                stat: '30 DIAS SEGUIDOS',
                statColor: '#9747FF',
                icon: 'flame'
            },

            // Exploration badges
            'Na Chuva e no Sol': {
                name: 'NA CHUVA E NO SOL',
                stat: '5 CONDIÇÕES',
                statColor: '#32CD32',
                icon: 'sun'
            },

            // Adherence badges
            'Fiel ao Plano': {
                name: 'FIEL AO PLANO',
                stat: '80% ADERÊNCIA',
                statColor: '#00D4FF',
                icon: 'medal'
            },
        };

        return nameMap[badge.name] || {
            name: badge.name?.toUpperCase() || 'BADGE',
            stat: badge.description || 'Conquista',
            statColor: '#00D4FF',
            icon: 'medal'
        };
    };

    // Real user progression data
    const currentLevel = stats?.current_level || 1;
    const totalXP = stats?.total_points || 0;
    const currentStreak = stats?.current_streak || 0;
    const xpToNext = stats?.points_to_next_level || 250;
    const progressPercentage = totalXP > 0 ? ((totalXP / (totalXP + xpToNext)) * 100) : 0;

    // Level name based on level
    const getLevelName = (level: number) => {
        if (level === 1) return 'Iniciante';
        if (level <= 3) return 'Corredor Amador';
        if (level <= 5) return 'Corredor Nato';
        if (level <= 10) return 'Atleta';
        return 'Campeão';
    };

    // Get earned and locked badges
    const earnedBadges = badges.filter(b => b.earned);
    const lockedBadges = badges.filter(b => !b.earned).slice(0, 3); // Show first 3 locked



    const renderBadgeIcon = (iconName: string, earned: boolean) => {
        const size = 65;
        switch (iconName) {
            case 'medal': return <LendaUrbanaIcon size={size} />;
            case 'speedometer': return <VelocistaIcon size={size} />;
            case 'sun': return <MadrugadorIcon size={size} />;
            case 'flame': return <ImparavelIcon size={size} />;
            default: return <TrophyIcon size={40} color={earned ? '#FFD700' : '#8E8E93'} />;
        }
    };



    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation?.goBack()}
                    >
                        <BackIcon size={24} color="#00D4FF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Minhas Conquistas</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {/* Level Card */}
                <View style={styles.levelCard}>
                    {/* Top Row: Level Badge and XP Card */}
                    <View style={styles.topRowContainer}>
                        {/* Level Badge - Top Left */}
                        <View style={styles.levelBadge}>
                            <Text style={styles.levelBadgeText}>Nível Atual</Text>
                        </View>

                        {/* XP Card - Top Right */}
                        <View style={styles.xpCard}>
                            <BoltIcon size={20} color="#FFD700" />
                            <View style={styles.xpTextContainer}>
                                <Text style={styles.xpValue}>{totalXP.toLocaleString()}</Text>
                                <Text style={styles.xpLabel}>xp acumulado</Text>
                            </View>
                        </View>
                    </View>

                    {/* Level Info */}
                    <Text style={styles.levelName}>{getLevelName(currentLevel)}</Text>
                    <Text style={styles.levelNumber}>{currentLevel}</Text>

                    <View style={styles.comboRow}>
                        <FireIcon size={18} color="#32CD32" />
                        <Text style={styles.comboText}>Combo: {currentStreak} dias</Text>
                    </View>

                    {/* Progress Section */}
                    <View style={styles.progressSection}>
                        <View style={styles.progressLabelsRow}>
                            <Text style={styles.progressLabelWhite}>Nível {currentLevel}</Text>
                            <Text style={styles.progressLabelWhite}>Próximo</Text>
                            <Text style={styles.xpRemaining}>{xpToNext} XP Restantes</Text>
                        </View>
                        <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
                        </View>
                    </View>
                </View>

                {/* Conquistas Section */}
                <View style={styles.conquistasHeader}>
                    <View style={styles.conquistasTitleRow}>
                        <TrophyIcon size={20} color="#00D4FF" />
                        <Text style={styles.conquistasTitle}>Conquistas</Text>
                    </View>
                    <View style={styles.conquistasCount}>
                        <Text style={styles.conquistasCountNumber}>{earnedBadges.length}</Text>
                        <Text style={styles.conquistasCountText}>/50 DESBLOQUEADOS</Text>
                    </View>
                </View>

                {/* Badges Grid */}
                <View style={styles.badgesGrid}>
                    {earnedBadges.map((badge) => (
                        <View key={badge.id} style={styles.badgeCard}>
                            <View style={styles.badgeIconContainer}>
                                {renderBadgeIcon(badge.icon, badge.earned)}
                            </View>
                            <Text style={styles.badgeName}>{badge.name}</Text>
                            <View style={[styles.badgeStat, { backgroundColor: `${badge.statColor}20` }]}>
                                <Text style={[styles.badgeStatText, { color: badge.statColor }]}>{badge.stat}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Próximos Desafios */}
                <View style={styles.lockedSection}>
                    <View style={styles.lockedHeader}>
                        <LockIcon size={24} color="rgba(235,235,245,0.6)" />
                        <Text style={styles.lockedTitle}>Próximos Desafios</Text>
                    </View>
                    <View style={styles.lockedGrid}>
                        {lockedBadges.map((badge) => {
                            const displayInfo = getBadgeDisplayInfo(badge);
                            return (
                                <View key={badge.id} style={styles.lockedCard}>
                                    <View style={styles.lockedIconContainer}>
                                        <View style={{ opacity: 0.3 }}>
                                            {renderBadgeIcon(displayInfo.icon, false)}
                                        </View>
                                        <View style={styles.lockOverlay}>
                                            <LockIcon size={16} color="rgba(235,235,245,0.6)" />
                                        </View>
                                    </View>
                                    <Text style={styles.lockedName}>{displayInfo.name}</Text>
                                    <Text style={styles.lockedSubtitle}>{displayInfo.stat}</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A18',
    },
    scrollView: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#FFFFFF',
    },
    headerSpacer: {
        width: 40,
    },
    levelCard: {
        backgroundColor: '#1C1C2E',
        marginHorizontal: spacing.lg,
        marginBottom: spacing.xl,
        borderRadius: 24,
        padding: spacing.lg,
        position: 'relative',
    },
    levelCardLeft: {
        flex: 1,
    },
    topRowContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.lg,
    },
    levelBadge: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '#00D4FF',
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        borderRadius: 20,
    },
    levelBadgeText: {
        fontSize: 13,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#00D4FF',
    },
    levelName: {
        fontSize: typography.fontSizes.xl,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    levelNumber: {
        fontSize: 56,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
        lineHeight: 64,
        marginBottom: spacing.sm,
    },
    comboRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: spacing.xl,
    },
    comboText: {
        fontSize: typography.fontSizes.base,
        color: '#32CD32',
        fontWeight: typography.fontWeights.semibold as any,
    },
    levelProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    levelProgressLabel: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235,235,245,0.6)',
    },
    xpRemaining: {
        fontSize: typography.fontSizes.sm,
        color: '#00D4FF',
        fontWeight: typography.fontWeights.semibold as any,
    },
    xpCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '#FFD700',
        borderRadius: 16,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    xpTextContainer: {
        alignItems: 'flex-end',
    },
    xpValue: {
        fontSize: 22,
        fontWeight: typography.fontWeights.bold as any,
        color: '#FFD700',
        lineHeight: 26,
    },
    xpLabel: {
        fontSize: 11,
        color: '#FFD700',
    },
    progressSection: {
        width: '100%',
    },
    progressLabelsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        marginBottom: spacing.sm,
    },
    progressLabelWhite: {
        fontSize: typography.fontSizes.sm,
        color: '#FFFFFF',
        fontWeight: typography.fontWeights.semibold as any,
    },
    progressBar: {
        width: '100%',
        height: 10,
        backgroundColor: 'rgba(0, 212, 255, 0.2)',
        borderRadius: 5,
        overflow: 'hidden',
    },
    progressFill: {
        width: '70%',
        height: '100%',
        backgroundColor: '#00D4FF',
        borderRadius: 5,
    },
    conquistasHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.lg,
    },
    conquistasTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    conquistasTitle: {
        fontSize: typography.fontSizes.lg,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#FFFFFF',
    },
    conquistasCount: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: 16,
    },
    conquistasCountNumber: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.bold as any,
        color: '#00D4FF',
    },
    conquistasCountText: {
        fontSize: typography.fontSizes.xs,
        color: 'rgba(235,235,245,0.6)',
    },
    badgesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    badgeCard: {
        width: '47%',
        backgroundColor: '#1C1C2E',
        borderRadius: 20,
        padding: spacing.lg,
        alignItems: 'center',
    },
    badgeIconContainer: {
        width: 65,
        height: 65,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    badgeName: {
        fontSize: typography.fontSizes.sm,
        fontWeight: typography.fontWeights.semibold as any,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    badgeStat: {
        backgroundColor: 'rgba(0,212,255,0.2)',
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeStatText: {
        fontSize: 10,
        color: '#00D4FF',
        fontWeight: typography.fontWeights.medium as any,
    },
    lockedSection: {
        paddingHorizontal: spacing.lg,
        paddingBottom: 120,
    },
    lockedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    lockedTitle: {
        fontSize: typography.fontSizes.sm,
        color: 'rgba(235,235,245,0.6)',
    },
    lockedGrid: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    lockedCard: {
        flex: 1,
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        padding: spacing.md,
        alignItems: 'center',
    },
    lockedIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.sm,
        position: 'relative',
    },
    lockOverlay: {
        position: 'absolute',
        bottom: -4,
        right: -4,
        backgroundColor: '#1C1C2E',
        borderRadius: 10,
        padding: 2,
    },
    lockedName: {
        fontSize: 11,
        color: 'rgba(235,235,245,0.6)',
        textAlign: 'center',
    },
    lockedSubtitle: {
        fontSize: 11,
        color: 'rgba(235,235,245,0.6)',
        textAlign: 'center',
    },
});
