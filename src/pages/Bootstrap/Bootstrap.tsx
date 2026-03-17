import { useMemo, useState } from 'react';
import { AppNavbar } from '@/components/layout/AppNavbar';
import { FloatingHelper } from '@/components/layout/FloatingHelper';
import { ScreenCard } from '@/components/layout/ScreenCard';
import { BOOTSTRAP_PAGES } from './pageDefinitions';

const DEFAULT_PAGE_ID = BOOTSTRAP_PAGES[0]?.id ?? '';

export const Bootstrap = () => {
    const [activePageId, setActivePageId] = useState(DEFAULT_PAGE_ID);
    const [helperExpanded, setHelperExpanded] = useState(true);

    const activePage = useMemo(
        () => BOOTSTRAP_PAGES.find((page) => page.id === activePageId) ?? BOOTSTRAP_PAGES[0],
        [activePageId]
    );

    const activeIndex = useMemo(
        () => BOOTSTRAP_PAGES.findIndex((page) => page.id === activePageId),
        [activePageId]
    );

    const hasPrevious = activeIndex > 0;
    const hasNext = activeIndex >= 0 && activeIndex < BOOTSTRAP_PAGES.length - 1;

    const goToPrevious = () => {
        if (!hasPrevious) {
            return;
        }
        setActivePageId(BOOTSTRAP_PAGES[activeIndex - 1].id);
    };

    const goToNext = () => {
        if (!hasNext) {
            return;
        }
        setActivePageId(BOOTSTRAP_PAGES[activeIndex + 1].id);
    };

    if (!activePage) {
        return null;
    }

    return (
        <main className="min-h-screen bg-slate-100 pb-24">
            <AppNavbar pages={BOOTSTRAP_PAGES} activePageId={activePage.id} onSelectPage={setActivePageId} />

            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5">
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                        {activeIndex + 1} / {BOOTSTRAP_PAGES.length} screens
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={goToPrevious}
                            disabled={!hasPrevious}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            onClick={goToNext}
                            disabled={!hasNext}
                            className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>

                <ScreenCard page={activePage} />
            </div>

            <FloatingHelper expanded={helperExpanded} onToggle={() => setHelperExpanded((value) => !value)} />
        </main>
    );
};
