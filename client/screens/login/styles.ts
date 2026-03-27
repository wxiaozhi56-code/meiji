import { StyleSheet } from 'react-native';
import { Spacing, BorderRadius, Theme } from '@/constants/theme';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: Spacing['2xl'],
      paddingTop: Spacing['6xl'],
      paddingBottom: Spacing['3xl'],
      justifyContent: 'center',
    },
    header: {
      alignItems: 'center',
      marginBottom: Spacing['4xl'],
    },
    logoContainer: {
      width: 80,
      height: 80,
      borderRadius: BorderRadius.full,
      backgroundColor: theme.backgroundTertiary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.xl,
    },
    form: {
      marginBottom: Spacing['3xl'],
    },
    inputGroup: {
      marginBottom: Spacing.xl,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.backgroundTertiary,
      borderRadius: BorderRadius.lg,
      marginTop: Spacing.md,
      paddingHorizontal: Spacing.lg,
    },
    inputIcon: {
      marginRight: Spacing.md,
    },
    input: {
      flex: 1,
      paddingVertical: Spacing.lg,
      fontSize: 16,
      color: theme.textPrimary,
    },
    eyeButton: {
      padding: Spacing.sm,
    },
    loginButton: {
      backgroundColor: theme.primary,
      borderRadius: BorderRadius.lg,
      paddingVertical: Spacing.xl,
      alignItems: 'center',
      marginTop: Spacing['2xl'],
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    loginButtonDisabled: {
      backgroundColor: theme.textMuted,
      shadowColor: theme.textMuted,
    },
    registerLink: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Spacing['2xl'],
      gap: Spacing.xs,
    },
    testInfo: {
      alignItems: 'center',
      gap: Spacing.xs,
      paddingTop: Spacing['2xl'],
      borderTopWidth: 1,
      borderTopColor: theme.borderLight,
    },
  });
};
