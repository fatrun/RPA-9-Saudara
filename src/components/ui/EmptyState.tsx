import React from 'react';
import { LucideIcon, PlusCircle, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  badge?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  badge = 'Fondasi Modul Siap',
}) => {
  return (
    <div className="w-full flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-ios border border-dashed border-cream-border/90 bg-surface-card/60 backdrop-blur-sm shadow-ios-card my-4">
      {/* Icon Capsule */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cream-100 to-cream-200 border border-cream-300 flex items-center justify-center text-rpaGreen shadow-sm mb-4">
        <Icon className="w-8 h-8" />
      </div>

      {badge && (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rpaGreen-50 text-rpaGreen border border-rpaGreen-200 mb-3">
          <Sparkles className="w-3.5 h-3.5" /> {badge}
        </span>
      )}

      <h3 className="text-lg font-bold text-rpaGreen-900 tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 max-w-md mt-1.5 leading-relaxed">{description}</p>

      {/* Action Buttons */}
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream font-semibold text-sm transition-all shadow-md shadow-rpaGreen-950/20"
            >
              <PlusCircle className="w-4 h-4" /> {actionLabel}
            </button>
          )}

          {secondaryActionLabel && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-subtle hover:bg-cream-100 active:scale-95 text-slate-700 font-semibold text-sm transition-all border border-surface-border"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
