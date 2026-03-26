import { StyleSheet } from 'react-native';
import { Spacing, BorderRadius, Theme } from '@/constants/theme';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing['2xl'],
      paddingTop: Spacing['2xl'],
      paddingBottom: Spacing.xl,
      backgroundColor: theme.backgroundRoot,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.full,
      backgroundColor: theme.backgroundTertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    placeholder: {
      width: 40,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Spacing['2xl'],
      paddingBottom: Spacing['6xl'],
    },
    section: {
      marginBottom: Spacing['2xl'],
    },
    contextInput: {
      backgroundColor: theme.backgroundTertiary,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginTop: Spacing.md,
      fontSize: 15,
      color: theme.textPrimary,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
      backgroundColor: theme.primary,
      borderRadius: BorderRadius.lg,
      paddingVertical: Spacing.xl,
      marginBottom: Spacing['2xl'],
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    generateButtonDisabled: {
      backgroundColor: theme.textMuted,
      shadowColor: theme.textMuted,
    },
    messageCard: {
      backgroundColor: theme.backgroundDefault,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      marginBottom: Spacing.lg,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    messageHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    messageType: {
      backgroundColor: theme.accent,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.sm,
    },
    iconButton: {
      padding: Spacing.sm,
    },
    messageActions: {
      marginTop: Spacing.lg,
      paddingTop: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: theme.borderLight,
    },
    useButton: {
      backgroundColor: theme.primary,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    tipsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: theme.backgroundTertiary,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginTop: Spacing.md,
    },
  });
};
