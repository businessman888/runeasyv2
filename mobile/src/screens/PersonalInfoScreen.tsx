import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TouchableOpacity,
    Image,
    TextInput,
    Platform,
    Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, typography, spacing } from '../theme';
import { useAuthStore } from '../stores';
import { CustomCalendar } from '../components/CustomCalendar';

// SVG Icons
function BackIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12L15.41 7.41Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>‹</Text>;
}

function PersonIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>👤</Text>;
}

function LockIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM15.1 8H8.9V6C8.9 4.29 10.29 2.9 12 2.9C13.71 2.9 15.1 4.29 15.1 6V8Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>🔒</Text>;
}

function CalendarIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M19 3H18V1H16V3H8V1H6V3H5C3.89 3 3.01 3.9 3.01 5L3 19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V8H19V19ZM7 10H12V15H7V10Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>📅</Text>;
}

function EditIcon({ size = 16, color = '#0A0A18' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M3 17.25V21H6.75L17.81 9.94L14.06 6.19L3 17.25ZM20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>✏️</Text>;
}

function InfoIcon({ size = 20, color = '#00D4FF' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>ℹ️</Text>;
}

function ChevronDownIcon({ size = 20, color = 'rgba(235,235,245,0.6)' }: { size?: number; color?: string }) {
    if (Platform.OS === 'web') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
                <path d="M7.41 8.59L12 13.17L16.59 8.59L18 10L12 16L6 10L7.41 8.59Z" />
            </svg>
        );
    }
    return <Text style={{ fontSize: size, color }}>▼</Text>;
}

export function PersonalInfoScreen({ navigation }: any) {
    const { user } = useAuthStore();

    // Parse birth date from user profile or use default
    const parseBirthDate = (dateString?: string) => {
        if (!dateString) return new Date(1995, 4, 15); // Default: May 15, 1995

        // Try to parse MM/DD/YYYY or YYYY-MM-DD format
        const parts = dateString.includes('/')
            ? dateString.split('/').map(p => parseInt(p))
            : dateString.split('-').map(p => parseInt(p));

        if (dateString.includes('/')) {
            // MM/DD/YYYY
            return new Date(parts[2], parts[0] - 1, parts[1]);
        } else {
            // YYYY-MM-DD
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
    const [email] = useState(user?.email || 'fernanda.oliveira@email.com'); // Not editable
    const [birthDateObj, setBirthDateObj] = useState(parseBirthDate(user?.profile?.birth_date));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [weight, setWeight] = useState(user?.profile?.weight?.toString() || '62');
    const [height, setHeight] = useState(user?.profile?.height?.toString() || '168');
    const [profilePhoto, setProfilePhoto] = useState(user?.profile?.profile_pic || null);
    const [isSaving, setIsSaving] = useState(false);

    // Get user initials for avatar fallback
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
            // Request permission
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (permissionResult.granted === false) {
                Alert.alert('Permissão necessária', 'É necessário permitir acesso à galeria de fotos.');
                return;
            }

            // Launch image picker
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

    const handleDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(Platform.OS === 'ios'); // Keep open on iOS
        if (selectedDate) {
            setBirthDateObj(selectedDate);
        }
    };

    const saveChanges = async () => {
        // Prevent multiple save attempts
        if (isSaving) {
            console.log('Save already in progress, ignoring duplicate request');
            return;
        }

        try {
            setIsSaving(true);
            console.log('=== STARTING SAVE PROCESS ===');

            // Validate required fields
            if (!fullName || fullName.trim().length === 0) {
                Alert.alert('Erro de validação', 'Por favor, preencha o nome completo.');
                setIsSaving(false);
                return;
            }

            if (!user?.id) {
                console.error('User ID is missing:', user);
                Alert.alert('Erro', 'Usuário não identificado. Por favor, faça login novamente.');
                setIsSaving(false);
                return;
            }

            // Get API URL from environment
            const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
            console.log('API_URL:', API_URL);
            console.log('User ID:', user.id);
            console.log('User email:', user.email);

            // Split full name into firstname and lastname
            const nameParts = fullName.trim().split(' ');
            const firstname = nameParts[0] || '';
            const lastname = nameParts.slice(1).join(' ') || '';

            // Prepare update data
            const updateData = {
                firstname,
                lastname,
                birth_date: birthDateObj.toISOString().split('T')[0], // YYYY-MM-DD format
                weight: weight ? parseFloat(weight) : null,
                height: height ? parseFloat(height) : null,
            };

            console.log('Update data prepared:', updateData);

            // Construct full endpoint URL
            const endpoint = `${API_URL}/users/${user.id}/profile`;
            console.log('Making request to:', endpoint);

            // Update profile data
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                },
                body: JSON.stringify({ profile: updateData }),
            });

            console.log('Response received - Status:', response.status);
            console.log('Response OK:', response.ok);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Save failed - Status:', response.status);
                console.error('Error response:', errorText);

                let errorMessage = 'Não foi possível salvar as alterações.';

                if (response.status === 401) {
                    errorMessage = 'Não autorizado. Por favor, faça login novamente.';
                } else if (response.status === 404) {
                    errorMessage = 'Usuário não encontrado.';
                } else if (response.status >= 500) {
                    errorMessage = 'Erro no servidor. Por favor, tente novamente mais tarde.';
                }

                throw new Error(errorMessage);
            }

            const responseData = await response.json();
            console.log('Save successful! Response data:', responseData);

            // If there's a new profile photo, upload it
            if (profilePhoto && !profilePhoto.startsWith('http')) {
                console.log('New photo to upload:', profilePhoto);
                // TODO: Implement photo upload to backend
            }

            // Update local user state
            console.log('Updating local user state...');
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

            console.log('Local state updated successfully');
            console.log('=== SAVE PROCESS COMPLETED ===');

            setIsSaving(false);

            // Show success message and navigate back
            Alert.alert('Sucesso', 'Informações atualizadas com sucesso!', [
                {
                    text: 'OK',
                    onPress: () => {
                        console.log('Navigating back to settings...');
                        navigation.goBack();
                    }
                }
            ]);
        } catch (error) {
            setIsSaving(false);
            console.error('=== SAVE PROCESS FAILED ===');
            console.error('Error details:', error);

            const errorMessage = error instanceof Error
                ? error.message
                : 'Não foi possível salvar as alterações.';

            Alert.alert('Erro', errorMessage);
        }
    };

    const handleSave = () => {
        console.log('=== HANDLE SAVE CLICKED ===');
        console.log('Current user:', user);
        console.log('Current form data:', { fullName, birthDateObj, weight, height });

        // Call saveChanges directly - removed Alert.alert as it's not working
        console.log('Calling saveChanges directly...');
        saveChanges();
    };

    return (
        <SafeAreaView style={styles.container}>
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
                    onPress={handleSave}
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
                                source={{
                                    uri: profilePhoto || user?.profile?.profile_pic
                                }}
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
                            onDateSelect={(date) => {
                                setBirthDateObj(date);
                            }}
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

                <View style={styles.spacer} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0E0E1F',
    },
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
        borderColor: '#0E0E1F',
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
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#EBEBF5',
        paddingHorizontal: spacing.md,
        height: 52,
    },
    inputContainerSmall: {
        backgroundColor: '#1C1C2E',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#EBEBF5',
        paddingHorizontal: spacing.md,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inputDisabled: {
        opacity: 0.7,
    },
    dateInputWrapper: {
        // Container for web date input
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
    segmentedControl: {
        flexDirection: 'row',
        backgroundColor: '#1C1C2E',
        borderRadius: 20,
        padding: 4,
    },
    segmentButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    segmentButtonActive: {
        backgroundColor: '#2A2A3E',
    },
    segmentButtonText: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(235,235,245,0.6)',
    },
    segmentButtonTextActive: {
        color: '#FFFFFF',
    },
    dropdownContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1C1C2E',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#EBEBF5',
        paddingHorizontal: spacing.md,
        height: 52,
    },
    dropdownText: {
        fontSize: 16,
        fontWeight: '400',
        color: '#FFFFFF',
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(0,212,255,0.1)',
        borderRadius: 12,
        padding: spacing.md,
        marginTop: spacing.xl,
        gap: spacing.sm,
    },
    infoBannerText: {
        flex: 1,
        fontSize: 12,
        fontWeight: '400',
        color: 'rgba(235,235,245,0.8)',
        lineHeight: 18,
    },
    spacer: {
        height: 100,
    },
});
