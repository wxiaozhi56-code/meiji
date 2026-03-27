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
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderLight,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.backgroundTertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    placeholder: {
      width: 40,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: Spacing.lg,
      paddingBottom: Spacing['5xl'],
    },
    section: {
      marginBottom: Spacing.xl,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    infoCard: {
      backgroundColor: theme.backgroundDefault,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginTop: Spacing.sm,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    infoIcon: {
      width: 24,
      marginRight: Spacing.md,
    },
    infoLabel: {
      flex: 1,
    },
    infoValue: {
      marginLeft: 40,
      marginTop: Spacing.xs,
    },
    divider: {
      height: 1,
      backgroundColor: theme.borderLight,
      marginVertical: Spacing.lg,
    },
    input: {
      backgroundColor: theme.backgroundTertiary,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      fontSize: 16,
      color: theme.textPrimary,
      marginTop: Spacing.xs,
      marginLeft: 40,
    },
    inputMultiline: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    buttonGroup: {
      flexDirection: 'row',
      gap: Spacing.md,
      marginTop: Spacing.xl,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: theme.backgroundTertiary,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    saveButton: {
      flex: 1,
      backgroundColor: theme.primary,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
  });
};
