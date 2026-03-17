interface FloatingHelperProps {
    expanded: boolean;
    onToggle: () => void;
}

export const FloatingHelper = ({ expanded, onToggle }: FloatingHelperProps) => {
    return (
        <aside className="fixed bottom-5 right-5 z-30">
            <div className="w-72 rounded-2xl border border-slate-200 bg-white shadow-xl">
                {expanded ? (
                    <div className="space-y-3 p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-slate-900">Floating Helper</h2>
                            <button
                                type="button"
                                onClick={onToggle}
                                className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                            >
                                Collapse
                            </button>
                        </div>
                        <p className="text-sm text-slate-600">
                            Shared assistant component across every bootstrapped page.
                        </p>
                        <div className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600">
                            Next pass: replace each generic section with exact frame content.
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={onToggle}
                        className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
                    >
                        Open Helper
                    </button>
                )}
            </div>
        </aside>
    );
};
