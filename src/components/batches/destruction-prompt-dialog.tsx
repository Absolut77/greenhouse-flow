import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function YesNoDialog({
  open,
  onOpenChange,
  title,
  description,
  onAnswer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  onAnswer: (yes: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onAnswer(false)}>Non</AlertDialogCancel>
          <AlertDialogAction onClick={() => onAnswer(true)}>Oui</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Backward-compat alias used elsewhere
export function DestructionPromptDialog({
  open,
  onOpenChange,
  stageLabel,
  onAnswer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stageLabel: string;
  onAnswer: (yes: boolean) => void;
}) {
  return (
    <YesNoDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Destruction durant « ${stageLabel} » ?`}
      description="Y a-t-il eu de la destruction durant cette étape ?"
      onAnswer={onAnswer}
    />
  );
}
