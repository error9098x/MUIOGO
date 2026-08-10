export const TIER = { LEVERS: 1, ASSUMPTIONS: 2, REFERENCE: 3 };

export const GROUPS = [
    {
        id: 'taxes',
        title: 'Taxes',
        icon: 'fa-percent',
        tier: TIER.LEVERS,
        blurb: 'Tax rates and credits. The most common reform surface.'
    },
    {
        id: 'spending',
        title: 'Government spending & pensions',
        icon: 'fa-bank',
        tier: TIER.LEVERS,
        blurb: 'Spending, transfers, pensions, debt and how the budget closes.'
    },
    {
        id: 'production',
        title: 'Growth & production',
        icon: 'fa-line-chart',
        tier: TIER.LEVERS,
        blurb: 'Productivity growth and the production function.'
    },
    {
        id: 'households',
        title: 'Households & preferences',
        icon: 'fa-user',
        tier: TIER.ASSUMPTIONS,
        blurb: 'Behavioural parameters. Usually calibrated, occasionally tested.'
    },
    {
        id: 'demographics',
        title: 'Demographics',
        icon: 'fa-users',
        tier: TIER.ASSUMPTIONS,
        blurb: 'Horizon and population growth. The age profiles come from the calibration.'
    },
    {
        id: 'open',
        title: 'Open economy',
        icon: 'fa-globe',
        tier: TIER.ASSUMPTIONS,
        blurb: 'Foreign capital, foreign debt and the world interest rate.'
    },
    {
        id: 'arrays',
        title: 'Arrays & reference data',
        icon: 'fa-table',
        tier: TIER.REFERENCE,
        blurb: 'Large values that come from the calibration or a separate estimation step.'
    },
    {
        id: 'advanced',
        title: 'Advanced',
        icon: 'fa-cogs',
        tier: TIER.REFERENCE,
        blurb: 'Model dimensions and solver settings. Changing these affects convergence, not policy.'
    }
];

export const DEFAULT_GROUP = 'advanced';

export const SUFFIX_RULES = [
    { suffix: '_preTP', group: 'arrays', reason: 'calibration',
      note: 'Pre-transition value used to start the model, from the calibration.' },
    { suffix: '_ge', group: 'arrays', reason: 'calibration',
      note: 'General-equilibrium variant, derived from the base parameter rather than set directly.' }
];

export function suffixRule(name){
    for (let i = 0; i < SUFFIX_RULES.length; i++){
        let rule = SUFFIX_RULES[i];
        if (String(name).slice(-rule.suffix.length) == rule.suffix){
            return rule;
        }
    }
    return null;
}

export const GROUP_OF = {
    cit_rate: 'taxes',
    tau_payroll: 'taxes',
    frac_tax_payroll: 'taxes',
    inv_tax_credit: 'taxes',
    c_corp_share_of_assets: 'taxes',
    tau_bq: 'taxes',
    tau_c: 'taxes',
    p_wealth: 'taxes',
    h_wealth: 'taxes',
    m_wealth: 'taxes',
    tax_func_type: 'taxes',
    labor_income_tax_noncompliance_rate: 'taxes',
    capital_income_tax_noncompliance_rate: 'taxes',

    alpha_G: 'spending',
    alpha_T: 'spending',
    alpha_I: 'spending',
    infra_investment_leakage_rate: 'spending',
    ubi_nom_017: 'spending',
    ubi_nom_1864: 'spending',
    ubi_nom_65p: 'spending',
    ubi_nom_max: 'spending',
    ubi_growthadj: 'spending',
    tau_p: 'spending',
    retirement_age: 'spending',
    pension_system: 'spending',
    initial_debt_ratio: 'spending',
    debt_ratio_ss: 'spending',
    initial_Kg_ratio: 'spending',
    tG1: 'spending',
    tG2: 'spending',
    rho_G: 'spending',
    budget_balance: 'spending',
    baseline_spending: 'spending',

    g_y_annual: 'production',
    g_y: 'production',
    gamma: 'production',
    gamma_g: 'production',
    Z: 'production',
    epsilon: 'production',
    delta_annual: 'production',
    delta_g_annual: 'production',
    delta_tau_annual: 'production',
    io_matrix: 'production',
    alpha_c: 'production',

    sigma: 'households',
    frisch: 'households',
    beta_annual: 'households',
    chi_b: 'households',
    chi_n: 'households',
    ltilde: 'households',
    lambdas: 'households',
    e: 'households',
    zeta: 'households',
    eta: 'households',
    eta_RM: 'households',
    use_zeta: 'households',
    alpha_RM_1: 'households',
    alpha_RM_T: 'households',
    g_RM: 'households',
    avg_earn_num_years: 'households',
    constant_demographics: 'households',

    start_year: 'demographics',
    g_n_ss: 'demographics',
    g_n: 'demographics',
    omega: 'demographics',
    omega_SS: 'demographics',
    omega_S_preTP: 'demographics',
    imm_rates: 'demographics',
    rho: 'demographics',
    initial_pop: 'demographics',

    world_int_rate_annual: 'open',
    zeta_D: 'open',
    zeta_K: 'open',
    initial_foreign_debt_ratio: 'open',
    foreign_debt_ratio: 'open',

    S: 'advanced',
    J: 'advanced',
    T: 'advanced',
    I: 'advanced',
    M: 'advanced',
    starting_age: 'advanced',
    ending_age: 'advanced',
    nu: 'advanced',
    maxiter: 'advanced',
    mindist_SS: 'advanced',
    mindist_TPI: 'advanced',
    RC_SS: 'advanced',
    RC_TPI: 'advanced',
    SS_root_method: 'advanced',
    FOC_root_method: 'advanced',
    initial_guess_r_SS: 'advanced',
    initial_guess_TR_SS: 'advanced',
    initial_guess_factor_SS: 'advanced',
    initial_guess_w_SS: 'advanced',
    use_sparse_FOC_jac: 'advanced'
};

export const READ_ONLY = {
    chi_n: { reason: 'calibration', note: 'The whole age curve is scaled by formula during calibration. Editing one age would put a meaningless kink in it.' },
    e: { reason: 'calibration', note: 'Earnings ability by age and income group, estimated for this country.' },
    zeta: { reason: 'calibration', note: 'Bequest distribution, from the calibration.' },
    eta: { reason: 'calibration', note: 'Transfer distribution, from the calibration.' },
    eta_RM: { reason: 'calibration', note: 'Remittance distribution, from the calibration.' },
    omega: { reason: 'calibration', note: 'Population shares by age, from the demographic source.' },
    omega_SS: { reason: 'calibration', note: 'Steady-state population shares, from the demographic source.' },
    omega_S_preTP: { reason: 'calibration', note: 'Pre-transition population shares, from the demographic source.' },
    imm_rates: { reason: 'calibration', note: 'Immigration rates by age, from the demographic source.' },
    rho: { reason: 'calibration', note: 'Mortality rates by age, from the demographic source.' },
    g_n: { reason: 'calibration', note: 'The population growth path comes from the demographic source; only its steady-state value is set here.' },
    g_y: { reason: 'calibration', note: 'The per-period growth path is derived from the annual growth rate; set g_y_annual instead.' },
    initial_pop: { reason: 'calibration', note: 'Initial population, from the demographic source.' },
    io_matrix: { reason: 'calibration', note: 'Input-output shares. Each column sums to 1, and it only applies when there is more than one industry or good.' },
    alpha_c: { reason: 'calibration', note: 'Consumption shares across goods. They sum to 1.' },

    etr_params: { reason: 'estimated', note: 'Effective tax rate coefficients, fitted by a separate microsimulation step.' },
    mtrx_params: { reason: 'estimated', note: 'Marginal labour income tax coefficients, fitted by a separate microsimulation step.' },
    mtry_params: { reason: 'estimated', note: 'Marginal capital income tax coefficients, fitted by a separate microsimulation step.' },
    tax_func_type: { reason: 'estimated', note: 'Set by the tax-function estimation that produced the coefficients.' },
    income_tax_filer: { reason: 'estimated', note: 'Filer flags come from the microdata.' },
    wealth_tax_filer: { reason: 'estimated', note: 'Filer flags come from the microdata.' },

    S: { reason: 'structural', note: 'Number of age cohorts. A reform must share its baseline dimensions, so this is fixed for the case.' },
    J: { reason: 'structural', note: 'Number of lifetime-income groups. A reform must share its baseline dimensions.' },
    T: { reason: 'structural', note: 'Length of the transition path. A reform must share its baseline dimensions.' },
    I: { reason: 'structural', note: 'Number of consumption goods. A reform must share its baseline dimensions.' },
    M: { reason: 'structural', note: 'Number of production industries. A reform must share its baseline dimensions.' },
    starting_age: { reason: 'structural', note: 'Sets the age grid together with S.' },
    ending_age: { reason: 'structural', note: 'Sets the age grid together with S.' },

    nu: { reason: 'solver', note: 'Dampening on the solver update.' },
    maxiter: { reason: 'solver', note: 'Iteration cap for the solve.' },
    mindist_SS: { reason: 'solver', note: 'Steady-state convergence tolerance.' },
    mindist_TPI: { reason: 'solver', note: 'Transition-path convergence tolerance.' },
    RC_SS: { reason: 'solver', note: 'Steady-state resource-constraint check.' },
    RC_TPI: { reason: 'solver', note: 'Transition-path resource-constraint check.' },
    SS_root_method: { reason: 'solver', note: 'Root-finding method for the steady state.' },
    FOC_root_method: { reason: 'solver', note: 'Root-finding method for the first-order conditions.' },
    initial_guess_r_SS: { reason: 'solver', note: 'Starting guess for the interest rate.' },
    initial_guess_TR_SS: { reason: 'solver', note: 'Starting guess for total transfers.' },
    initial_guess_w_SS: { reason: 'solver', note: 'Starting guess for the wage.' },
    initial_guess_factor_SS: { reason: 'solver', note: 'Starting guess for the scaling factor.' },
    use_sparse_FOC_jac: { reason: 'solver', note: 'Sparse Jacobian switch for the solver.' }
};

export const READ_ONLY_LABEL = {
    calibration: 'from calibration',
    estimated: 'estimated externally',
    structural: 'fixed for this case',
    solver: 'solver setting'
};

export const DIMENSION = {
    beta_annual: 'by_j',
    lambdas: 'by_j',
    chi_b: 'by_j',
    chi_n: 'by_age',
    rho: 'by_age',
    omega_SS: 'by_age',
    omega_S_preTP: 'by_age',
    imm_rates: 'by_age',
    e: 'matrix',
    zeta: 'matrix',
    eta: 'matrix',
    eta_RM: 'matrix',
    io_matrix: 'matrix',
    omega: 'matrix',
    etr_params: 'matrix',
    mtrx_params: 'matrix',
    mtry_params: 'matrix'
};

export const CONSTRAINT = {
    lambdas: 'sum_to_one'
};

export const CHOICES = {
    pension_system: [
        'US-Style Social Security',
        'Defined Benefits',
        'Notional Defined Contribution',
        'Points System'
    ],
    SS_root_method: ['hybr', 'lm', 'krylov', 'anderson', 'df-sane'],
    FOC_root_method: ['hybr', 'lm', 'krylov', 'anderson', 'df-sane'],
    tax_func_type: ['DEP', 'DEP_totalinc', 'GS', 'HSV', 'linear', 'mono', 'mono2D']
};

export const HELP = {
    start_year: 'First year of the simulation; the transition path runs from here.',
    g_n_ss: 'Long-run population growth rate. The full path comes from the country demographics.',
    g_y_annual: 'Long-run productivity growth per year, labour-augmenting.',
    gamma: 'Capital share of output in production.',
    gamma_g: 'Public capital share in production.',
    Z: 'Total factor productivity level; scales output.',
    epsilon: 'Elasticity of substitution between capital and labour. 1.0 is Cobb-Douglas.',
    delta_annual: 'Annual depreciation rate of private capital.',
    sigma: 'Relative risk aversion in household utility.',
    frisch: 'Frisch elasticity of labour supply: how hours respond to wages.',
    beta_annual: 'Patience, one value per income group. Higher means the group saves more.',
    lambdas: 'Share of the population in each lifetime-income group. Must total 1.',
    ltilde: 'Total time endowment per period.',
    cit_rate: 'Corporate income tax rate.',
    tau_payroll: 'Payroll tax rate.',
    tau_bq: 'Tax on bequests.',
    tau_c: 'Consumption tax rate, per good.',
    p_wealth: 'Level of the wealth tax.',
    initial_debt_ratio: 'Government debt as a share of GDP in the first period.',
    debt_ratio_ss: 'Government debt as a share of GDP in the long run.',
    alpha_G: 'Government consumption as a share of GDP.',
    alpha_T: 'Government transfers to households as a share of GDP.',
    alpha_I: 'Government investment in public capital as a share of GDP.',
    retirement_age: 'Age at which households become eligible for pensions.',
    tG1: 'Period the budget-closure rule starts.',
    tG2: 'Period the budget-closure rule completes.',
    rho_G: 'Speed of budget closure.',
    budget_balance: 'Balance the government budget every period instead of issuing debt.',
    world_int_rate_annual: 'Interest rate available on world markets.',
    zeta_D: 'Share of new government debt bought by foreigners.',
    zeta_K: 'Share of the capital gap filled by foreign investment.',
    S: 'Number of age cohorts alive each period.',
    J: 'Number of lifetime-income groups.',
    T: 'Number of periods on the transition path.',
    I: 'Number of consumption goods.',
    M: 'Number of production industries.'
};

export const LOCKED_DIMS = ['S', 'T', 'J', 'M', 'I'];

export function decorate(name, entry) {
    entry = entry || {};
    let ro = READ_ONLY[name] || null;
    let rule = ro ? null : suffixRule(name);
    if (rule){
        ro = { reason: rule.reason, note: rule.note };
    }
    let dimension = DIMENSION[name] || null;
    if (!dimension) {
        if (entry.shape == 'scalar'){
            dimension = 'scalar';
        }else if (entry.shape == 'time_x_industry'){
            dimension = 'matrix';
        }else{
            dimension = 'by_year';
        }
    }
    let large = entry.large === true || entry.default === null;
    return {
        name: name,
        title: entry.title || name,
        description: entry.description || '',
        section: entry.section || '',
        subsection: entry.subsection || null,
        type: entry.type || 'level',
        shape: entry.shape || 'scalar',
        dimension: dimension,
        min: (entry.min === 0 || entry.min) ? entry.min : null,
        max: (entry.max === 0 || entry.max) ? entry.max : null,
        def: entry.default,
        large: large,
        readOnly: !!ro || large,
        readOnlyReason: ro ? ro.reason : (large ? 'calibration' : null),
        readOnlyNote: ro ? ro.note : (large ? 'This value is too large to edit as a form field. It comes from the calibration.' : null),
        constraint: CONSTRAINT[name] || null,
        choices: CHOICES[name] || null,
        help: HELP[name] || '',
        group: GROUP_OF[name] || (rule ? rule.group : null) || DEFAULT_GROUP
    };
}
