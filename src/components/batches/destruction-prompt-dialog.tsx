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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Destruction durant « {stageLabel} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Y a-t-il eu de la destruction durant cette étape ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onAnswer(false)}>Non</AlertDialogCancel>
          <AlertDialogAction onClick={() => onAnswer(true)}>Oui</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
