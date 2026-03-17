import type { BootstrapPageDefinition } from '@/pages/Bootstrap/pageDefinitions';
import { cn } from '@/utils';

interface AppNavbarProps {
    pages: BootstrapPageDefinition[];
    activePageId: string;
    onSelectPage: (pageId: string) => void;
}

export const AppNavbar = ({ pages, activePageId, onSelectPage }: AppNavbarProps) => {
    return (
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Dalia</p>
                    <h1 className="text-lg font-semibold text-slate-900">Figma Bootstrap</h1>
                </div>
                <nav className="flex gap-2 overflow-x-auto pb-1">
                    {pages.map((page, index) => (
                        <button
                            key={page.id}
                            type="button"
                            onClick={() => onSelectPage(page.id)}
                            className={cn(
                                'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors',
                                activePageId === page.id
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            )}
                        >
                            {String(index + 1).padStart(2, '0')}
                        </button>
                    ))}
                </nav>
            </div>
        </header>
    );
};
