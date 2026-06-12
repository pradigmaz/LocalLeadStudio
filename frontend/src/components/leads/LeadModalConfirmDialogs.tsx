import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Lead } from "@/types"

interface LeadModalConfirmDialogsProps {
  lead: Lead;
  isDeleteDialogOpen: boolean;
  isBlacklistDialogOpen: boolean;
  onDeleteDialogChange: (open: boolean) => void;
  onBlacklistDialogChange: (open: boolean) => void;
  onDeleteLead: () => void;
  onBlacklistBrand: () => void;
}

export function LeadModalConfirmDialogs({
  lead,
  isDeleteDialogOpen,
  isBlacklistDialogOpen,
  onDeleteDialogChange,
  onBlacklistDialogChange,
  onDeleteLead,
  onBlacklistBrand,
}: LeadModalConfirmDialogsProps) {
  return (
    <>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={onDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удаление лида</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить лид "{lead.name}" и все его данные из базы?
              Это действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={onDeleteLead} className="bg-red-600 hover:bg-red-700 text-white">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBlacklistDialogOpen} onOpenChange={onBlacklistDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>В чёрный список</AlertDialogTitle>
            <AlertDialogDescription>
              Добавить "{lead.name}" в чёрный список сетевиков?
              Лид получит статус "Сетевик" и больше не будет показываться.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={onBlacklistBrand}>Добавить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
