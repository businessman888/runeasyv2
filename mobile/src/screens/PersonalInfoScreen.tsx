import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, typography, spacing } from '../theme';
import { useAuthStore } from '../stores';
import { CustomCalendar } from '../components/CustomCalendar';
import { ScreenContainer } from '../components/ScreenContainer';

// Icon components using @expo/vector-icons
function BackIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
    return <Ionicons name="chevron-back" size={size} color={color} />;
}

function PersonIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="person-outline" size={size} color={color} />;
}

function LockIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="lock-closed-outline" size={size} color={color} />;
}

function CalendarIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    return <Ionicons name="calendar-outline" size={size} color={color} />;
}

function EditIcon({ size = 16, color = '#0A0A18' }: { size?: number; color?: string }) {
    return <MaterialCommunityIcons name="pencil" size={size} color={color} />;
}

function InfoIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    return <Ionicons name="information-circle-outline" size={size} color={color} />;
}

export function PersonalInfoScreen({ navigation }: any) {
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

    // Form state
    const [fullName, setFullName] = useState(
        user?.profile?.firstname
            ? `${user.profile.firstname} ${user.profile.lastname || ''}`
            : 'João Carlos Gomes Pereira'
    );
    const [email] = useState(user?.email || 'fernanda.oliveira@email.com');
    const [birthDateObj, setBirthDateObj] = useState(parseBirthDate(user?.profile?.birth_date));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [weight, setWeight] = useState(user?.profile?.weight?.toString() || '62');
    const [height, setHeight] = useState(user?.profile?.height?.toString() || '168');
    const [profilePhoto, setProfilePhoto] = useState(user?.profile?.profile_pic || null);
    const [isSaving, setIsSaving] = useState(false);

    const getInitials = (name: string) => {
        if (!name) return 'U';
        const parts = name.trim().split(' ').filter(p => p.length > 0);
        if (parts.length === 1) {
            return parts[0][0].toUpperCase();
        }
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const handleSelectPhoto = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (permissionResult.granted === false) {
                Alert.alert('Permissão necessária', 'É necessário permitir acesso à galeria de fotos.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                setProfilePhoto(result.assets[0].uri);
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
                birth_date: birthDateObj.toISOString().split('T')[0],
                weight: weight ? parseFloat(weight) : null,
                height: height ? parseFloat(height) : null,
            };

            const response = await fetch(`${API_URL}/users/${user.id}/profile`, {
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
                    birth_date: birthDateObj.toISOString().split('T')[0],
                    weight: weight ? parseFloat(weight) : undefined,
                    height: height ? parseFloat(height) : undefined,
                    profile_pic: profilePhoto || user?.profile?.profile_pic || '',
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
                    <BackIcon size={24} color="#FFFFFF" />
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
                        {(profilePhoto && profilePhoto.startsWith('http')) ||
                            (user?.profile?.profile_pic && user.profile.profile_pic.startsWith('http')) ? (
                            <Image
                                source={{ uri: profilePhoto || user?.profile?.profile_pic }}
                                style={styles.avatar}
                            />
                        ) : (
                            <View style={styles.avatarInitials}>
                                <Text style={styles.initialsText}>{getInitials(fullName)}</Text>
                            </View>
                        )}
                        <TouchableOpacity
                            style={styles.editAvatarButton}
                            onPress={handleSelectPhoto}
                        >
                            <EditIcon size={14} color="#0A0A18" />
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
                                placeholderTextColor="rgba(235,235,245,0.4)"
                            />
                            <PersonIcon size={20} color="rgba(235,235,245,0.6)" />
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
                                placeholderTextColor="rgba(235,235,245,0.4)"
                            />
                            <LockIcon size={20} color="rgba(235,235,245,0.6)" />
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
                            <CalendarIcon size={20} color="rgba(235,235,245,0.6)" />
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
                                    placeholderTextColor="rgba(235,235,245,0.4)"
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
                                    placeholderTextColor="rgba(235,235,245,0.4)"
                                />
                            </View>
                        </View>
                    </View>
                </View>

                {/* Info Banner */}
                <View style={styles.infoBanner}>
                    <InfoIcon size={20} color="#00D4FF" />
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
    saveButton: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#00D4FF',
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
        borderColor: '#00D4FF',
    },
    avatarInitials: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: '#00D4FF',
        backgroundColor: '#1C1C2E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    initialsText: {
        fontSize: 36,
        fontWeight: '600',
        color: '#00D4FF',
        textTransform: 'uppercase',
    },
    editAvatarButton: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#00D4FF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#0A0A18',
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
        color: 'rgba(235,235,245,0.6)',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(235,235,245,0.2)',
        paddingHorizontal: spacing.md,
        height: 52,
    },
    inputContainerSmall: {
        backgroundColor: '#1C1C2E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(235,235,245,0.2)',
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
        color: '#FFFFFF',
        paddingVertical: 0,
    },
    textInputDisabled: {
        color: 'rgba(235,235,245,0.6)',
    },
    textInputCenter: {
        fontSize: 16,
        fontWeight: '500',
        color: '#FFFFFF',
        textAlign: 'center',
        width: '100%',
    },
    dateText: {
        flex: 1,
        fontSize: 16,
        fontWeight: '400',
        color: '#FFFFFF',
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
        backgroundColor: 'rgba(0,212,255,0.1)',
        borderRadius: 16,
        padding: spacing.md,
        marginTop: spacing.xl,
        marginHorizontal: 0,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(0,212,255,0.2)',
    },
    infoBannerText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '400',
        color: 'rgba(235,235,245,0.8)',
        lineHeight: 18,
    },
    bottomSpacer: {
        height: 120,
    },
});
