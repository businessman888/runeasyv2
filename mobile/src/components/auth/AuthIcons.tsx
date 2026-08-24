import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors, useThemeSubscription } from '../../theme';

/**
 * Shared SVG atoms for the auth card. GoogleIcon + EyeIcon were lifted verbatim
 * from the old LoginScreen so the Google "G" stays the official colored artwork
 * on white (branding compliance) and the password toggle matches the rest of
 * the app. BackIcon is the "return to previous state" chevron.
 */

// Official multicolor Google "G" — do NOT recolor (Google branding compliance).
export const GoogleIcon = React.memo(() => (
    <Svg width={20} height={20} viewBox="0 0 48 48">
        <Path
            d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"
            fill="#FFC107"
        />
        <Path
            d="M5.3 14.7l7 5.1C14.2 15.7 18.7 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 15.4 2 8.1 7.3 5.3 14.7z"
            fill="#FF3D00"
        />
        <Path
            d="M24 46c5.2 0 10-1.8 13.7-4.9l-6.7-5.5C29.1 37.1 26.7 38 24 38c-6 0-11.1-4-12.8-9.5l-7 5.4C7 41 14.7 46 24 46z"
            fill="#4CAF50"
        />
        <Path
            d="M44.5 20H24v8.5h11.8c-1 3.2-3.1 5.8-5.8 7.6l6.7 5.5C40.5 38.2 46 32 46 24c0-1.3-.2-2.7-.5-4z"
            fill="#1976D2"
        />
    </Svg>
));
GoogleIcon.displayName = 'GoogleIcon';

// Eye / eye-off for the password visibility toggle.
export const EyeIcon = React.memo(({ visible }: { visible: boolean }) => {
    useThemeSubscription();

    return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
            d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
            stroke={colors.textSecondary}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Path
            d="M12 15a3 3 0 100-6 3 3 0 000 6z"
            stroke={colors.textSecondary}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        {!visible && (
            <Path d="M4 4l16 16" stroke={colors.textSecondary} strokeWidth={1.6} strokeLinecap="round" />
        )}
    </Svg>
    );
});
EyeIcon.displayName = 'EyeIcon';

// Leading chevron for the "back to previous state" control.
export const BackIcon = React.memo(({ color = colors.textSecondary }: { color?: string }) => {
    useThemeSubscription();

    return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
            d="M15 18l-6-6 6-6"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
    );
});
BackIcon.displayName = 'BackIcon';

// Trailing chevron / mail glyph for the "Continuar com e-mail" row.
export const MailIcon = React.memo(({ color = colors.text }: { color?: string }) => {
    useThemeSubscription();

    return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
            d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Path
            d="M4 7l8 6 8-6"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
    );
});
MailIcon.displayName = 'MailIcon';
