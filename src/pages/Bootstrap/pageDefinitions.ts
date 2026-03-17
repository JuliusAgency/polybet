export interface BootstrapPageDefinition {
    id: string;
    title: string;
    subtitle: string;
    accentClass: string;
    features: string[];
}

const ACCENTS = [
    'from-sky-500 to-blue-600',
    'from-emerald-500 to-teal-600',
    'from-indigo-500 to-violet-600',
    'from-rose-500 to-pink-600',
];

const PHASES = ['Welcome', 'Identity', 'Profile', 'Planning', 'Support', 'Review'];

const makeFeatures = (pageNumber: number): string[] => {
    const slots = [
        `Primary form section ${pageNumber}`,
        `Status panel ${pageNumber}`,
        `Quick actions ${pageNumber}`,
    ];

    if (pageNumber % 2 === 0) {
        slots[2] = `Insights strip ${pageNumber}`;
    }

    if (pageNumber % 3 === 0) {
        slots[1] = `Timeline block ${pageNumber}`;
    }

    return slots;
};

export const BOOTSTRAP_PAGES: BootstrapPageDefinition[] = Array.from({ length: 24 }, (_, index) => {
    const pageNumber = index + 1;
    const phase = PHASES[index % PHASES.length];

    return {
        id: `page-${String(pageNumber).padStart(2, '0')}`,
        title: `${phase} Screen ${String(pageNumber).padStart(2, '0')}`,
        subtitle: `Bootstrapped from Dalia.fig page ${String(pageNumber).padStart(2, '0')} with shared layout primitives.`,
        accentClass: ACCENTS[index % ACCENTS.length],
        features: makeFeatures(pageNumber),
    };
});
