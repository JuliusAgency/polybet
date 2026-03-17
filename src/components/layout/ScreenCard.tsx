import type { BootstrapPageDefinition } from '@/pages/Bootstrap/pageDefinitions';

interface ScreenCardProps {
    page: BootstrapPageDefinition;
}

export const ScreenCard = ({ page }: ScreenCardProps) => {
    return (
        <section className="mx-auto w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`mb-4 rounded-2xl bg-gradient-to-r px-4 py-5 text-white ${page.accentClass}`}>
                <p className="text-xs uppercase tracking-[0.2em] opacity-90">{page.id.replace('page-', 'Page ')}</p>
                <h2 className="mt-1 text-xl font-semibold">{page.title}</h2>
                <p className="mt-2 text-sm text-white/90">{page.subtitle}</p>
            </div>

            <div className="space-y-3">
                {page.features.map((feature) => (
                    <article
                        key={feature}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
                    >
                        {feature}
                    </article>
                ))}
            </div>
        </section>
    );
};
