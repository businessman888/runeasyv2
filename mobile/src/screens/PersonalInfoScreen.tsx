import React, { useState } from 'react';
import { authedFetch } from '../services/apiClient';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    TextInput,
    Platform,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, typography, spacing, createThemeStyles, useThemeSubscription } from '../theme';
import { semanticColors } from '../theme/semanticColors';
import { useAuthStore, getDisplayName, getAvatarUrl } from '../stores';
import { CustomCalendar } from '../components/CustomCalendar';
import { ScreenContainer } from '../components/ScreenContainer';

// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = semanticColors.textPrimary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function PersonIcon({ size = 20, color = semanticColors.textSecondary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="person-outline" size={size} color={color} />;
}

function LockIcon({ size = 20, color = semanticColors.textSecondary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="lock-closed-outline" size={size} color={color} />;
}

function CalendarIcon({ size = 20, color = semanticColors.textSecondary }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="calendar-outline" size={size} color={color} />;
}

function EditIcon({ size = 16, color = semanticColors.textOnAccent }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <MaterialCommunityIcons name="pencil" size={size} color={color} />;
}

function InfoIcon({ size = 20, color = semanticColors.accent }: { size?: number; color?: string }) {
    useThemeSubscription();
    return <Ionicons name="information-circle-outline" size={size} color={color} />;
}

export function PersonalInfoScreen({ navigation }: any) {
    useThemeSubscription();
    const { user } = useAuthStore();

    // Parse birth date from user profile or use default
    const parseBirthDate = (dateString?: string) => {
        if (!dateString) return new Date(1995, 4, 15); // Default: May 15, 1995

        const parts = dateString.includes('/')
            ? dateString.split('/').map(p => parseInt(p))
            : dateString.split('-').map(p => parseInt(p));

        if (dateString.includes('/')) {
            return new Date(parts[2], parts[0] - 1, parts[1]);
        } else {
            return new Date(parts[0], parts[1] - 1, parts[2]);
        }
    };

    const formatDate = (date: Date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    // Form state — initialized from real user data
    const [fullName, setFullName] = useState(getDisplayName(user));
    const [email] = useState(user?.email || '');
    const [birthDateObj, setBirthDateObj] = useState(parseBirthDate(user?.profile?.birth_date));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [weight, setWeight] = useState(
        (user?.profile?.weight_kg ?? user?.profile?.weight)?.toString() || ''
    );
    const [height, setHeight] = useState(
        (user?.profile?.height_cm ?? user?.profile?.height)?.toString() || ''
    );
    const [profilePhoto, setProfilePhoto] = useState(getAvatarUrl(user));
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

    const getInitials = (name: string) => {
        if (!name) return 'U';
        const parts = name.trim().split(' ').filter(p => p.length > 0);
        if (parts.length === 1) {
            return parts[0][0].toUpperCase();
        }
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const uploadAvatarToBackend = async (asset: ImagePicker.ImagePickerAsset): Promise<string> => {
        if (!user?.id) {
            throw new Error('Usuário não identificado.');
        }

        const { BASE_API_URL } = require('../config/api.config');
        const fileName = asset.fileName || `avatar-${Date.now()}.jpg`;
        const inferredExt = (fileName.split('.').pop() || 'jpg').toLowerCase();
        const mimeFromExt: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            heic: 'image/heic',
            heif: 'image/heif',
        };
        const mimeType = asset.mimeType || mimeFromExt[inferredExt] || 'image/jpeg';

        const formData = new FormData();
        // React Native FormData accepts { uri, name, type } for file fields
        formData.append('file', {
            uri: asset.uri,
            name: fileName,
            type: mimeType,
        } as unknown as Blob);

        const response = await authedFetch(`${BASE_API_URL}/users/${user.id}/profile/avatar`, {
            method: 'POST',
            headers: {
                'x-user-id': user.id,
                // Do NOT set Content-Type — fetch + FormData sets the correct multipart boundary.
            },
            body: formData,
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(errBody || 'Falha no upload da foto.');
        }

        const data = (await response.json()) as { avatar_url?: string };
        if (!data.avatar_url) {
            throw new Error('Resposta inválida do servidor.');
        }
        return data.avatar_url;
    };

    const handleSelectPhoto = async () => {
        if (isUploadingPhoto) return;

        try {
            // No permission request: launchImageLibraryAsync uses the system Photo
            // Picker (Android 13+) / PHPicker (iOS), which run out-of-process and
            // need NO media-library permission. Requesting READ_MEDIA_* here would
            // both be unnecessary and violate Google Play's Photo Picker policy.
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (result.canceled || !result.assets[0]) return;

            const asset = result.assets[0];
            const previousPhoto = profilePhoto;
            setIsUploadingPhoto(true);

            try {
                const uploadedUrl = await uploadAvatarToBackend(asset);

                setProfilePhoto(uploadedUrl);

                if (user) {
                    useAuthStore.getState().setUser({
                        ...user,
                        profile: {
                            ...user.profile,
                            profile_pic: uploadedUrl,
                            avatar_url: uploadedUrl,
                        },
                    });
                }
            } catch (uploadError) {
                // Restore previous (working) photo so the old Google/Apple avatar isn't lost.
                setProfilePhoto(previousPhoto);
                const message = uploadError instanceof Error ? uploadError.message : 'Não foi possível enviar a foto.';
                Alert.alert('Erro no upload', message);
            } finally {
                setIsUploadingPhoto(false);
            }
        } catch (error) {
            console.error('Error picking image:', error);
            Alert.alert('Erro', 'Não foi possível selecionar a imagem.');
        }
    };

    const saveChanges = async () => {
        if (isSaving) return;

        try {
            setIsSaving(true);

            if (!fullName || fullName.trim().length === 0) {
                Alert.alert('Erro de validação', 'Por favor, preencha o nome completo.');
                setIsSaving(false);
                return;
            }

            if (!user?.id) {
                Alert.alert('Erro', 'Usuário não identificado. Por favor, faça login novamente.');
                setIsSaving(false);
                return;
            }

            const { BASE_API_URL } = require('../config/api.config');
            const API_URL = BASE_API_URL;
            const nameParts = fullName.trim().split(' ');
            const firstname = nameParts[0] || '';
            const lastname = nameParts.slice(1).join(' ') || '';

            const updateData = {
                firstname,
                lastname,
                full_name: fullName.trim(),
                birth_date: birthDateObj.toISOString().split('T')[0],
                weight: weight ? parseFloat(weight) : null,
                height: height ? parseFloat(height) : null,
                weight_kg: weight ? parseFloat(weight) : null,
                height_cm: height ? parseFloat(height) : null,
            };

            const response = await authedFetch(`${API_URL}/users/${user.id}/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                },
                body: JSON.stringify({ profile: updateData }),
            });

            if (!response.ok) {
                throw new Error('Não foi possível salvar as alterações.');
            }

            useAuthStore.getState().setUser({
                ...user,
                profile: {
                    ...user.profile,
                    firstname,
                    lastname,
                    full_name: fullName.trim(),
                    birth_date: birthDateObj.toISOString().split('T')[0],
                    weight: weight ? parseFloat(weight) : undefined,
                    weight_kg: weight ? parseFloat(weight) : undefined,
                    height: height ? parseFloat(height) : undefined,
                    height_cm: height ? parseFloat(height) : undefined,
                    // profile_pic / avatar_url are persisted by the avatar upload endpoint,
                    // which runs the moment the user picks a photo. Don't overwrite here.
                },
            });

            setIsSaving(false);

            Alert.alert('Sucesso', 'Informações atualizadas com sucesso!', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            setIsSaving(false);
            const errorMessage = error instanceof Error ? error.message : 'Não foi possível salvar as alterações.';
            Alert.alert('Erro', errorMessage);
        }
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
                <Text style={styles.headerTitle}>Informações pessoais</Text>
                <TouchableOpacity
                    style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                    onPress={saveChanges}
                    disabled={isSaving}
                >
                    <Text style={styles.saveButtonText}>
                        {isSaving ? 'Salvando...' : 'Salvar'}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Profile Photo */}
                <View style={styles.profilePhotoSection}>
                    <View style={styles.avatarContainer}>
                        {profilePhoto && profilePhoto.startsWith('http') ? (
                            <Image
                                source={{ uri: profilePhoto }}
                                style={styles.avatar}
                            />
                        ) : (
                            <View style={styles.avatarInitials}>
                                <Text style={styles.initialsText}>{getInitials(fullName)}</Text>
                            </View>
                        )}
                        {isUploadingPhoto && (
                            <View style={styles.avatarUploadOverlay}>
                                <ActivityIndicator size="large" color={semanticColors.accent} />
                            </View>
                        )}
                        <TouchableOpacity
                            style={[styles.editAvatarButton, isUploadingPhoto && styles.editAvatarButtonDisabled]}
                            onPress={handleSelectPhoto}
                            disabled={isUploadingPhoto}
                        >
                            <EditIcon size={14} color={semanticColors.textOnAccent} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Form Fields */}
                <View style={styles.formSection}>
                    {/* Nome completo */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Nome completo</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.textInput}
                                value={fullName}
                                onChangeText={setFullName}
                                placeholderTextColor={semanticColors.textTertiary}
                            />
                            <PersonIcon size={20} color={semanticColors.textSecondary} />
                        </View>
                    </View>

                    {/* E-mail */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>E-mail</Text>
                        <View style={[styles.inputContainer, styles.inputDisabled]} pointerEvents="none">
                            <TextInput
                                style={[styles.textInput, styles.textInputDisabled]}
                                value={email}
                                editable={false}
                                placeholderTextColor={semanticColors.textTertiary}
                            />
                            <LockIcon size={20} color={semanticColors.textSecondary} />
                        </View>
                    </View>

                    {/* Data de nascimento */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Data de nascimento</Text>
                        <TouchableOpacity
                            style={styles.inputContainer}
                            onPress={() => setShowDatePicker(true)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.dateText}>{formatDate(birthDateObj)}</Text>
                            <CalendarIcon size={20} color={semanticColors.textSecondary} />
                        </TouchableOpacity>

                        <CustomCalendar
                            visible={showDatePicker}
                            selectedDate={birthDateObj}
                            onDateSelect={(date) => setBirthDateObj(date)}
                            onClose={() => setShowDatePicker(false)}
                            maxDate={new Date()}
                            minDate={new Date(1900, 0, 1)}
                        />
                    </View>

                    {/* Peso e Altura */}
                    <View style={styles.rowInputs}>
                        <View style={styles.halfInputGroup}>
                            <Text style={styles.inputLabel}>Peso (KG)</Text>
                            <View style={styles.inputContainerSmall}>
                                <TextInput
                                    style={styles.textInputCenter}
                                    value={weight}
                                    onChangeText={setWeight}
                                    keyboardType="numeric"
                                    placeholderTextColor={semanticColors.textTertiary}
                                />
                            </View>
                        </View>
                        <View style={styles.halfInputGroup}>
                            <Text style={styles.inputLabel}>Altura (CM)</Text>
                            <View style={styles.inputContainerSmall}>
                                <TextInput
                                    style={styles.textInputCenter}
                                    value={height}
                                    onChangeText={setHeight}
                                    keyboardType="numeric"
                                    placeholderTextColor={semanticColors.textTertiary}
                                />
                            </View>
                        </View>
                    </View>
                </View>

                {/* Info Banner */}
                <View style={styles.infoBanner}>
                    <InfoIcon size={20} color={semanticColors.accent} />
                    <Text style={styles.infoBannerText}>
                        Seus dados biométricos são usados apenas para calcular métricas de performance, como VO2 Max e zonas de frequência cardíaca, além da estimativa de queima calórica.
                    </Text>
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
    saveButton: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: semanticColors.accent,
    },
    saveButtonDisabled: {
        opacity: 0.5,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: spacing.lg,
    },
    profilePhotoSection: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
    },
    avatarContainer: {
        position: 'relative',
        width: 100,
        height: 100,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: semanticColors.accent,
    },
    avatarInitials: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: semanticColors.accent,
        backgroundColor: semanticColors.surface2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    initialsText: {
        fontSize: 36,
        fontWeight: '600',
        color: semanticColors.accent,
        textTransform: 'uppercase',
    },
    editAvatarButton: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: semanticColors.accent,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: semanticColors.canvas,
    },
    editAvatarButtonDisabled: {
        opacity: 0.5,
    },
    avatarUploadOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: semanticColors.scrim,
        justifyContent: 'center',
        alignItems: 'center',
    },
    formSection: {
        gap: spacing.lg,
    },
    inputGroup: {
        gap: spacing.sm,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '400',
        color: semanticColors.textSecondary,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderStrong,
        paddingHorizontal: spacing.md,
        height: 52,
    },
    inputContainerSmall: {
        backgroundColor: semanticColors.surface2,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: semanticColors.borderStrong,
        paddingHorizontal: spacing.md,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inputDisabled: {
        opacity: 0.7,
    },
    textInput: {
        flex: 1,
        fontSize: 16,
        fontWeight: '400',
        color: semanticColors.textPrimary,
        paddingVertical: 0,
    },
    textInputDisabled: {
        color: semanticColors.textSecondary,
    },
    textInputCenter: {
        fontSize: 16,
        fontWeight: '500',
        color: semanticColors.textPrimary,
        textAlign: 'center',
        width: '100%',
    },
    dateText: {
        flex: 1,
        fontSize: 16,
        fontWeight: '400',
        color: semanticColors.textPrimary,
    },
    rowInputs: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    halfInputGroup: {
        flex: 1,
        gap: spacing.sm,
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: semanticColors.accentSubtle,
        borderRadius: 16,
        padding: spacing.md,
        marginTop: spacing.xl,
        marginHorizontal: 0,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: semanticColors.borderSubtle,
    },
    infoBannerText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '400',
        color: semanticColors.textSecondary,
        lineHeight: 18,
    },
    bottomSpacer: {
        height: 120,
    },
}));
