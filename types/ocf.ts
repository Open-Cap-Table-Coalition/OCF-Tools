// GENERATED FILE — DO NOT EDIT.
// Vendored from MattCantor/Open-Cap-Format-OCF@642da8f2d96238e76b07f512b21d163f901071e8
// Refresh: npm run ocf:refresh-types

/** Enumeration of interest accrual period types */
export type AccrualPeriodType =
  | "DAILY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUAL"
  | "ANNUAL";

/** Enumeration of address types */
export type AddressType = "LEGAL" | "CONTACT" | "OTHER";

/** Enumeration of allocation types for vesting terms. Using an example of 18 shares split across 4 tranches, each allocation type results in a different schedule as follows: 
  1.  Cumulative Rounding (5 - 4 - 5 - 4)
  2.  Cumulative Round Down (4 - 5 - 4 - 5)
  3.  Front Loaded (5 - 5 - 4 - 4)
  4.  Back Loaded (4 - 4 - 5 - 5)
  5.  Front Loaded to Single Tranche (6 - 4 - 4 - 4)
  6.  Back Loaded to Single Tranche (4 - 4 - 4 - 6)
  7.  Fractional (4.5 - 4.5 - 4.5 - 4.5) */
export type AllocationType =
  | "CUMULATIVE_ROUNDING"
  | "CUMULATIVE_ROUND_DOWN"
  | "FRONT_LOADED"
  | "BACK_LOADED"
  | "FRONT_LOADED_TO_SINGLE_TRANCHE"
  | "BACK_LOADED_TO_SINGLE_TRANCHE"
  | "FRACTIONAL";

/** Enumeration of authorized shares types */
export type AuthorizedShares = "NOT APPLICABLE" | "UNLIMITED";

/** Enumeration of equity compensation types (there are some things around the margins like RSAs that don't currently fit under the EquityCompensation umbrella but might arguably fall under this. If you want to create an RSA, create a stock issuance with vesting - you can link it to a plan as well, if you want).

**The enums stand for:**
1. OPTION_ISO (qualified)
2. OPTION_NSO (non-qualified)
3. OPTION (not NSO or ISO)
4. RSU (restricted share units)
5. CSAR(cash-settled stock appreciation rights)
6. SSAR(stock-settled stock appreciation rights) */
export type CompensationType =
  | "OPTION_NSO"
  | "OPTION_ISO"
  | "OPTION"
  | "RSU"
  | "CSAR"
  | "SSAR";

/** Enumeration of interest compounding types */
export type CompoundingType = "COMPOUNDING" | "SIMPLE";

/** Enumeration of convertible conversion calculation types. */
export type ConversionMechanismType =
  | "FIXED_AMOUNT_CONVERSION"
  | "FIXED_PERCENT_OF_CAPITALIZATION_CONVERSION"
  | "RATIO_CONVERSION"
  | "SAFE_CONVERSION"
  | "VALUATION_BASED_CONVERSION"
  | "CONVERTIBLE_NOTE_CONVERSION"
  | "CUSTOM_CONVERSION"
  | "PPS_BASED_CONVERSION";

/** Enumeration of types of conversion rights. */
export type ConversionRightType =
  | "CONVERTIBLE_CONVERSION_RIGHT"
  | "WARRANT_CONVERSION_RIGHT"
  | "STOCK_CLASS_CONVERSION_RIGHT";

/** Enumeration of convertible conversion timing for calculation purposes (e.g. does the instrument convert based on pre or post money). */
export type ConversionTimingType = "PRE_MONEY" | "POST_MONEY";

/** Enumeration of types of triggers common to various legal rights - e.g. does the satisfaction of a condition trigger an automatic conversion or merely a right to convert? If `UNSPECIFIED`, the system of record cannot represent this data in a structured form. */
export type ConversionTriggerType =
  | "AUTOMATIC_ON_CONDITION"
  | "AUTOMATIC_ON_DATE"
  | "ELECTIVE_IN_RANGE"
  | "ELECTIVE_ON_CONDITION"
  | "ELECTIVE_AT_WILL"
  | "UNSPECIFIED";

/** Enumeration of convertible instrument types */
export type ConvertibleType = "NOTE" | "SAFE" | "CONVERTIBLE_SECURITY";

/** Enumeration of how the number of days are determined per period */
export type DayCountType = "ACTUAL_365" | "30_360";

/** Enumeration of email types */
export type EmailType = "PERSONAL" | "BUSINESS" | "OTHER";

/** Enumeration of different OCF file types which are used to load proper schemas for validation */
export type FileType =
  | "OCF_MANIFEST_FILE"
  | "OCF_STAKEHOLDERS_FILE"
  | "OCF_STOCK_CLASSES_FILE"
  | "OCF_STOCK_LEGEND_TEMPLATES_FILE"
  | "OCF_STOCK_PLANS_FILE"
  | "OCF_TRANSACTIONS_FILE"
  | "OCF_VALUATIONS_FILE"
  | "OCF_VESTING_TERMS_FILE"
  | "OCF_FINANCINGS_FILE"
  | "OCF_DOCUMENTS_FILE";

/** Enumeration of interest payout types (e.g. deferred or cash payment) */
export type InterestPayoutType = "DEFERRED" | "CASH";

/** Enumeration of object types */
export type ObjectType =
  | "ISSUER"
  | "STAKEHOLDER"
  | "STOCK_CLASS"
  | "STOCK_LEGEND_TEMPLATE"
  | "STOCK_PLAN"
  | "VALUATION"
  | "VESTING_TERMS"
  | "FINANCING"
  | "DOCUMENT"
  | "CE_STAKEHOLDER_RELATIONSHIP"
  | "CE_STAKEHOLDER_STATUS"
  | "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT"
  | "TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT"
  | "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT"
  | "TX_STOCK_CLASS_SPLIT"
  | "TX_STOCK_PLAN_POOL_ADJUSTMENT"
  | "TX_STOCK_PLAN_RETURN_TO_POOL"
  | "TX_CONVERTIBLE_ACCEPTANCE"
  | "TX_CONVERTIBLE_CANCELLATION"
  | "TX_CONVERTIBLE_CONVERSION"
  | "TX_CONVERTIBLE_ISSUANCE"
  | "TX_CONVERTIBLE_RETRACTION"
  | "TX_CONVERTIBLE_TRANSFER"
  | "TX_EQUITY_COMPENSATION_ACCEPTANCE"
  | "TX_EQUITY_COMPENSATION_CANCELLATION"
  | "TX_EQUITY_COMPENSATION_EXERCISE"
  | "TX_EQUITY_COMPENSATION_ISSUANCE"
  | "TX_EQUITY_COMPENSATION_RELEASE"
  | "TX_EQUITY_COMPENSATION_RETRACTION"
  | "TX_EQUITY_COMPENSATION_TRANSFER"
  | "TX_EQUITY_COMPENSATION_REPRICING"
  | "TX_PLAN_SECURITY_ACCEPTANCE"
  | "TX_PLAN_SECURITY_CANCELLATION"
  | "TX_PLAN_SECURITY_EXERCISE"
  | "TX_PLAN_SECURITY_ISSUANCE"
  | "TX_PLAN_SECURITY_RELEASE"
  | "TX_PLAN_SECURITY_RETRACTION"
  | "TX_PLAN_SECURITY_TRANSFER"
  | "TX_STOCK_ACCEPTANCE"
  | "TX_STOCK_CANCELLATION"
  | "TX_STOCK_CONVERSION"
  | "TX_STOCK_ISSUANCE"
  | "TX_STOCK_REISSUANCE"
  | "TX_STOCK_CONSOLIDATION"
  | "TX_STOCK_REPURCHASE"
  | "TX_STOCK_RETRACTION"
  | "TX_STOCK_TRANSFER"
  | "TX_WARRANT_ACCEPTANCE"
  | "TX_WARRANT_CANCELLATION"
  | "TX_WARRANT_EXERCISE"
  | "TX_WARRANT_ISSUANCE"
  | "TX_WARRANT_RETRACTION"
  | "TX_WARRANT_TRANSFER"
  | "TX_VESTING_ACCELERATION"
  | "TX_VESTING_START"
  | "TX_VESTING_EVENT";

/** Enumeration of option types */
export type OptionType = "NSO" | "ISO" | "INTL";

/** Enumeration of parent sources a stock can be issued or created from */
export type ParentSecurityType =
  | "STOCK_PLAN"
  | "STOCK"
  | "WARRANT"
  | "CONVERTIBLE";

/** Enumeration of time period types */
export type PeriodType = "DAYS" | "MONTHS" | "YEARS";

/** Enumeration of phone number types */
export type PhoneType = "HOME" | "MOBILE" | "BUSINESS" | "OTHER";

/** Enumeration of quantity source types describing where a quantity value came from */
export type QuantitySourceType =
  | "HUMAN_ESTIMATED"
  | "MACHINE_ESTIMATED"
  | "UNSPECIFIED"
  | "INSTRUMENT_FIXED"
  | "INSTRUMENT_MAX"
  | "INSTRUMENT_MIN";

/** Enumeration of rounding types */
export type RoundingType = "CEILING" | "FLOOR" | "NORMAL";

/** Enumeration of types of relationships between stakeholder and issuer */
export type StakeholderRelationshipType =
  | "ADVISOR"
  | "BOARD_MEMBER"
  | "CONSULTANT"
  | "EMPLOYEE"
  | "EX_ADVISOR"
  | "EX_CONSULTANT"
  | "EX_EMPLOYEE"
  | "EXECUTIVE"
  | "FOUNDER"
  | "INVESTOR"
  | "NON_US_EMPLOYEE"
  | "OFFICER"
  | "OTHER";

/** Enumeration of types of activity statuses for a stakeholder */
export type StakeholderStatusType =
  | "ACTIVE"
  | "LEAVE_OF_ABSENCE"
  | "TERMINATION_VOLUNTARY_OTHER"
  | "TERMINATION_VOLUNTARY_GOOD_CAUSE"
  | "TERMINATION_VOLUNTARY_RETIREMENT"
  | "TERMINATION_INVOLUNTARY_OTHER"
  | "TERMINATION_INVOLUNTARY_DEATH"
  | "TERMINATION_INVOLUNTARY_DISABILITY"
  | "TERMINATION_INVOLUNTARY_WITH_CAUSE";

/** Enumeration of stakeholder types - individual (human) or institution (entity) */
export type StakeholderType = "INDIVIDUAL" | "INSTITUTION";

/** Enumeration of stock class types */
export type StockClassType = "COMMON" | "PREFERRED";

/** Enumeration of issuance types where we want to draw attention to some unique aspect of a stock issuance (e.g. is it an RSA) */
export type StockIssuanceType = "RSA" | "FOUNDERS_STOCK";

/** For a given stock plan, what is the default rule for what happens to the shares reserved for a Plan Security after it's cancelled. */
export type StockPlanCancellationBehaviorType =
  | "RETIRE"
  | "RETURN_TO_POOL"
  | "HOLD_AS_CAPITAL_STOCK"
  | "DEFINED_PER_PLAN_SECURITY";

/** Enumeration of termination window types */
export type TerminationWindowType =
  | "VOLUNTARY_OTHER"
  | "VOLUNTARY_GOOD_CAUSE"
  | "VOLUNTARY_RETIREMENT"
  | "INVOLUNTARY_OTHER"
  | "INVOLUNTARY_DEATH"
  | "INVOLUNTARY_DISABILITY"
  | "INVOLUNTARY_WITH_CAUSE";

/** Enumeration types of valuation inputs that go into a formula - e.g. use a specified value (`FIXED`), a cap (`VALUATION_CAP`) or actual valuation (`ACTUAL`). */
export type ValuationBasedFormulaType = "FIXED" | "ACTUAL" | "CAP";

/** Enumeration of valuation types */
export type ValuationType = "409A";

/** Enumeration representing a vesting "day of month". Since not all months have 29, 30, or 31 days, this enum requires those values to also specify an overflow behavior.
 - `01` - `28` : Day 1, 2... 28 of the month; e.g. `03` means vesting occurs on the 3rd of the month.
 - `29_OR_LAST_DAY_OF_MONTH` - `31_OR_LAST_DAY_OF_MONTH` : Day 29, 30, or 31 of the month, defaulting to the last day of the month for shorter months; e.g. `31_OR_LAST_DAY_OF_MONTH` means monthly vesting occurs on Jan 31, Feb 28/29, Mar 31, Apr 30, etc.
 - `VESTING_START_DAY_OR_LAST_DAY_OF_MONTH` vests on the same day of month as the day of the `VESTING_START` condition; e.g. if vesting commences on Jan 15 then any vesting will accrue on the 15th of future vesting months. If vesting commencement occurs on days 29-31, this has the same behavior as the other `*_LAST_DAY_OF_MONTH` values. */
export type VestingDayOfMonth =
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "08"
  | "09"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18"
  | "19"
  | "20"
  | "21"
  | "22"
  | "23"
  | "24"
  | "25"
  | "26"
  | "27"
  | "28"
  | "29_OR_LAST_DAY_OF_MONTH"
  | "30_OR_LAST_DAY_OF_MONTH"
  | "31_OR_LAST_DAY_OF_MONTH"
  | "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH";

/** Enumeration of vesting trigger types */
export type VestingTriggerType =
  | "VESTING_START_DATE"
  | "VESTING_SCHEDULE_ABSOLUTE"
  | "VESTING_SCHEDULE_RELATIVE"
  | "VESTING_EVENT";

/** Type representation of an address */
export interface Address {
  /** What type of address is this (e.g. legal address, contact address, etc.) */
  address_type: AddressType;
  /** Street address (multi-line string) */
  street_suite?: string;
  /** City */
  city?: string;
  /** State, province, or equivalent identifier required for an address in this country */
  country_subdivision?: CountrySubdivisionCode;
  /** Country code for this address (ISO 3166-1 alpha-2) */
  country: CountryCode;
  /** Address postal code */
  postal_code?: string;
}

/** Type representation of automatic trigger on a tive or condition. */
export interface AutomaticConversionOnConditionTrigger
  extends BaseConversionTrigger {
  /** Legal language describing what conditions must be satisfied for the conversion to take place (ideally, this should be excerpted from the instrument where possible) */
  trigger_condition: string;
  type: "AUTOMATIC_ON_CONDITION";
}

/** Type representation of an automatic trigger on a date. */
export interface AutomaticConversionOnDateTrigger
  extends BaseConversionTrigger {
  /** Date on which trigger occurs automatically (if it hasn't already occured) */
  trigger_date: Date;
  type: "AUTOMATIC_ON_DATE";
}

/** Type represents a group of securities that constitutes some formally defined part of the company (e.g. post-money capitalization vs pre-money for a security) */
export interface CapitalizationDefinition {
  /** All issuances of stock classes with these ids should be included (unless such an issuance is specifically included in `exclude_security_ids` */
  include_stock_class_ids: string[];
  /** All issuances of plan securities from stock plans with these ids should be included (unless such an issuance is specifically excluded in `exclude_security_ids` */
  include_stock_plans_ids: string[];
  /** Securities (whether Stock, Plan Securities, Convertibles or Warrants) with these security ids should be included from this definition of capitalization (overrides plan or class-level rules) */
  include_security_ids: string[];
  /** Securities (whether Stock, Plan Securities, Convertibles or Warrants) with these security ids should be excluded from this definition of capitalization (overrides plan or class-level rules) */
  exclude_security_ids: string[];
}

/** Type represents the rules for determining the capitalization definition for a security */
export interface CapitalizationDefinitionRules {
  /** Include all outstanding share issuances in the capitalization definition */
  include_outstanding_shares: boolean;
  /** Include all outstanding options in the capitalization definition */
  include_outstanding_options: boolean;
  /** Include all outstanding options that have been reserved but have not been issued yet in the capitalization definition */
  include_outstanding_unissued_options: boolean;
  /** Include the shares issued for converting this security in the capitalization definition */
  include_this_security: boolean;
  /** Include the shares issued for converting all other convertibles that are converted as part of the conversion event in the capitalization definition */
  include_other_converting_securities: boolean;
  /** Include the shares reserved for increasing option plans to cover all promised options in the capitalization definition */
  include_option_pool_topup_for_promised_options: boolean;
  /** Include the shares reserved for increasing option plans beyond the amount needed for any promised options in the capitalization definition */
  include_additional_option_pool_topup: boolean;
  /** Include the shares issued for any new share subscriptions that are part of the conversion event in the capitalization definition */
  include_new_money: boolean;
}

/** Type representation of a primary contact person for a stakeholder (e.g. a fund) */
export interface ContactInfo {
  /** Contact's name */
  name?: Name;
  /** Phone numbers to reach the contact at */
  phone_numbers?: Phone[];
  /** Emails to reach the contact at */
  emails?: Email[];
}

/** Type representation of the contact info for an individual stakeholder */
export interface ContactInfoWithoutName {
  /** Phone numbers to reach the contact at */
  phone_numbers?: Phone[];
  /** Emails to reach the contact at */
  emails?: Email[];
}

/** Type representation of a conversion right from a convertible into another non-plan security */
export interface ConvertibleConversionRight extends BaseConversionRight {
  type?: "CONVERTIBLE_CONVERSION_RIGHT";
  conversion_mechanism:
    | SAFEConversionMechanism
    | NoteConversionMechanism
    | CustomConversionMechanism
    | PercentCapitalizationConversionMechanism
    | FixedAmountConversionMechanism;
}

/**
 * Type representation of an ISO 3166-1 alpha 2 country code
 * @pattern ^[A-Z]{2}$
 */
export type CountryCode = string;

/**
 * State, province, or equivalent identifier required for an address in this country
 * @pattern ^[A-Z0-9]{1,}$
 */
export type CountrySubdivisionCode = string;

/**
 * Type representation of an ISO 4217 currency code
 * @pattern ^[A-Z]{3}$
 */
export type CurrencyCode = string;

/** Sets forth inputs and conversion mechanism of a custom conversion, a conversion type that cannot be accurately modelled with any other OCF conversion mechanism type */
export interface CustomConversionMechanism extends BaseConversionMechanism {
  type: "CUSTOM_CONVERSION";
  /** Detailed description of how the number of resulting shares should be determined? Use legal language from an instrument where possible */
  custom_conversion_description: string;
}

/**
 * Type represention of an ISO-8601 date, e.g. 2022-01-28
 * @format date
 */
export type Date = string;

/** Type representation of elective trigger valid at will (so long as instrument is valid and outstanding). */
export interface ElectiveConversionAtWillTrigger extends BaseConversionTrigger {
  type: "ELECTIVE_AT_WILL";
}

/** Type representation of elective trigger valid on or after start_date and until or before end_date. */
export interface ElectiveConversionInDateRangeTrigger
  extends BaseConversionTrigger {
  type: "ELECTIVE_IN_RANGE";
  /** Start date of range (inclusive) */
  start_date: Date;
  /** End date of range (inclusive) */
  end_date: Date;
}

/** Type representation of elective trigger on fulfillment of a condition. */
export interface ElectiveConversionOnConditionTrigger
  extends BaseConversionTrigger {
  /** Legal language describing what conditions must be satisfied for the conversion to take place (ideally, this should be excerpted from the instrument where possible) */
  trigger_condition: string;
  type: "ELECTIVE_ON_CONDITION";
}

/** Type representation of an email address */
export interface Email {
  /** Type of e-mail address (e.g. personal or business) */
  email_type: EmailType;
  /** A valid e-mail address */
  email_address: string;
}

/** Type representation of a file */
export interface File {
  /** Path to the file within the OCF container */
  filepath: string;
  /** MD5 file checksum */
  md5: Md5;
}

/** Describes how a security converts into a fixed amount of a stock class */
export interface FixedAmountConversionMechanism
  extends BaseConversionMechanism {
  type: "FIXED_AMOUNT_CONVERSION";
  /** How many shares of target Stock Class does this security convert into? */
  converts_to_quantity: Numeric;
}

/** Type representation of an interest rate, including accrual start and end dates */
export interface InterestRate {
  /** Interest rate for the convertible (decimal representation - e.g. 0.125 for 12.5%) */
  rate: Percentage;
  /** Commencement date for interest accruing at the specified rate */
  accrual_start_date: Date;
  /** Optional end date (inclusive) for interest accruing at the specified rate. If none specified, interest will accrue indefinitely or until accrual of next interest rate commences */
  accrual_end_date?: Date;
}

/**
 * String representation of MD5 hash with basic validation for a string of 32 characters composed of letters (uppercase or lowercase) and numbers
 * @pattern ^[a-fA-F0-9]{32}$
 */
export type Md5 = string;

/** Type representation of an amount of money in a specified currency */
export interface Monetary {
  /** Numeric amount of money */
  amount: Numeric;
  /** ISO 4217 currency code */
  currency: CurrencyCode;
}

/** Type comprising of multiple name components */
export interface Name {
  /** Legal full name for the individual/institution */
  legal_name: string;
  /** First/given name for the individual */
  first_name?: string;
  /** Last/family name for the individual */
  last_name?: string;
}

/** Sets forth inputs and conversion mechanism of a convertible note */
export interface NoteConversionMechanism extends BaseConversionMechanism {
  type: "CONVERTIBLE_NOTE_CONVERSION";
  /** Interest rate(s) of the convertible (if applicable) */
  interest_rates: InterestRate[];
  /** How many days are there is a given period for calculation purposes? */
  day_count_convention: DayCountType;
  /** How is interest paid out (if at applicable) */
  interest_payout: InterestPayoutType;
  /** What is the period over which interest is calculated? */
  interest_accrual_period: AccrualPeriodType;
  /** What type of interest compounding? */
  compounding_type: CompoundingType;
  /** What is the percentage discount available upon conversion, if applicable? (decimal representation - e.g. 0.125 for 12.5%) */
  conversion_discount?: Percentage;
  /** What is the valuation cap (if applicable)? */
  conversion_valuation_cap?: Monetary;
  /** How is company capitalization defined for purposes of conversion? If possible, include the legal language from the instrument. */
  capitalization_definition?: string;
  /** The rules for which types of securities would be included in the capitalization definition. */
  capitalization_definition_rules?: CapitalizationDefinitionRules;
  /** For cash proceeds calculation during a liquidity event. */
  exit_multiple?: Ratio;
  /** Is this an MFN (Most Favored Nations) flavored Convertible Note? */
  conversion_mfn?: boolean;
}

/**
 * Fixed-point string representation of a number (up to 10 decimal places supported)
 * @pattern ^[+-]?[0-9]+(\.[0-9]{1,10})?$
 */
export type Numeric = string;

/** A type representing a reference to any kind of OCF object */
export interface ObjectReference {
  /** The type of object being referenced. Informs which type of identifier is represented by the associated object_id */
  object_type: ObjectType;
  /** The identifier for the referenced object */
  object_id: string;
}

/**
 * Fixed-point string representation of a percentage as a decimal between 0.0 and 1.0 (up to 10 decimal places supported)
 * @pattern ^0?(\.[0-9]{1,10})?$|^1(\.0{1,10})?$
 */
export type Percentage = string;

/** Sets forth inputs and conversion mechanism of percent of capitalization conversion (where an instrument purports to grant a percent of company capitalization at some point in time) */
export interface PercentCapitalizationConversionMechanism
  extends BaseConversionMechanism {
  type: "FIXED_PERCENT_OF_CAPITALIZATION_CONVERSION";
  /** What percentage of the company capitalization does this convert to */
  converts_to_percent: Percentage;
  /** How is company capitalization defined for purposes of conversion? If possible, include the legal language from the instrument. */
  capitalization_definition?: string;
  /** The rules for which types of securities would be included in the capitalization definition. */
  capitalization_definition_rules?: CapitalizationDefinitionRules;
}

/** Type representation of a phone number */
export interface Phone {
  /** Type of phone number (e.g. mobile, home or business) */
  phone_type: PhoneType;
  /** A valid phone number string in ITU E.123 international notation (e.g. +123 123 456 7890). An extension number, if applicable, should be separated by words ''extension'' or ''ext.'' after the phone number (e.g. +123 123 456 7890 ext. 100). */
  phone_number: string;
}

/** Type representation of a ratio as two parts of a quotient, i.e. numerator and denominator numeric values */
export interface Ratio {
  /** Numerator of the ratio, i.e. the ratio of A to B (A:B) can be expressed as a fraction (A/B), where A is the numerator */
  numerator: Numeric;
  /** Denominator of the ratio, i.e. the ratio of A to B (A:B) can be expressed as a fraction (A/B), where B is the denominator */
  denominator: Numeric;
}

/** Sets forth inputs and conversion mechanism of a ratio conversion (primarily used to describe conversion from one stock class (e.g. Preferred) into another (e.g. Common) */
export interface RatioConversionMechanism extends BaseConversionMechanism {
  type: "RATIO_CONVERSION";
  /** What is the effective conversion price per share of this stock class? */
  conversion_price: Monetary;
  /** One share of this stock class converts into this many target stock class shares */
  ratio: Ratio;
  /** How should fractional shares be rounded? */
  rounding_type: RoundingType;
}

/** Sets forth inputs and conversion mechanism of a SAFE (mirrors the flavors and inputs of the Y Combinator SAFE) */
export interface SAFEConversionMechanism extends BaseConversionMechanism {
  type: "SAFE_CONVERSION";
  /** What is the percentage discount available upon conversion, if applicable? (decimal representation - e.g. 0.125 for 12.5%) */
  conversion_discount?: Percentage;
  /** What is the valuation cap (if applicable)? */
  conversion_valuation_cap?: Monetary;
  /** For cash proceeds calculation during a liquidity event. */
  exit_multiple?: Ratio;
  /** Is this an MFN flavored SAFE? */
  conversion_mfn: boolean;
  /** Should the conversion amount be based on pre or post money capitalization */
  conversion_timing?: ConversionTimingType;
  /** How is company capitalization defined for purposes of conversion? If possible, include the legal language from the instrument. */
  capitalization_definition?: string;
  /** The rules for which types of securities would be included in the capitalization definition. */
  capitalization_definition_rules?: CapitalizationDefinitionRules;
}

/** Type representation of a securities issuance exemption that includes an unstructured description and a country code for ease of processing and analysis */
export interface SecurityExemption {
  /** Description of an applicable security law exemption governing the issuance */
  description: string;
  /** Jurisdiction of the applicable law. This is a free-text field as there is no known enumeration of all global legal jurisdictions, but please try to use ISO 3166-1 alpha-2, if appropriate. Otherwise, we rely on implementers to choose an appropriate value here. */
  jurisdiction: string;
}

/** Type representation of a range of share numbers associated with an event (such as the share numbers associated with an issuance) - for use where shares are not fungible and need unique identifiers *per share* */
export interface ShareNumberRange {
  /** The starting share number of a range of shares impacted by a particular event (**INCLUSIVE** and assuming **share counts start at 1**) */
  starting_share_number: Numeric;
  /** The ending share number of a range of shares impacted by a particular event (**INCLUSIVE**) */
  ending_share_number: Numeric;
}

/** Sets forth inputs and conversion mechanism based on price per share of a future round (with potential discounts) */
export interface SharePriceBasedConversionMechanism
  extends BaseConversionMechanism {
  type: "PPS_BASED_CONVERSION";
  /** A description of the specifics of the conversion - e.g. The Holder is entitled, during the Exercise Period, to purchase from the Company such number of Preferred Shares as are equal to $100,000 divided by the Exercise Price. 'Exercise Price' shall mean 80% of the price per share paid by the investors in the next Qualified Financing. */
  description: string;
  /** True if the conversion shares should be based on a discount off the price-per-share in the next elligible financing */
  discount?: boolean;
  /** If the conversion price is base on a percent discount off the price-per-share of the next elligible financing, what is the discount percent */
  discount_percentage?: Percentage;
  /** If the resulting conversion shares is based on a fixed amount discount off the price-per-share of the next eilligible financing, what is the discount amount (in currency) */
  discount_amount?: Monetary;
}

/** Type representation of a conversion right from one Stock Class into another Stock Class */
export interface StockClassConversionRight extends BaseConversionRight {
  type?: "STOCK_CLASS_CONVERSION_RIGHT";
  conversion_mechanism: RatioConversionMechanism;
}

/** Type representation of the parent security of a given stock issuance (e.g. if a stock issuance came from a plan, such as an RSA, or if a stock came from a previous stock entry) */
export interface StockParent {
  /** Parent object type for this stock issuance (e.g. a stock plan or warrant) */
  parent_object_type: ParentSecurityType;
  /** Parent object's ID must be a valid ID pointing to an object of the type specified in parent_object_type */
  parent_object_id: string;
}

/** Type representation of a government identifier for tax purposes (e.g. EIN) and corresponding country code (ISO-3166) */
export interface TaxID {
  /** Tax identifier as string */
  tax_id: string;
  /** Issuing country code (ISO 3166-1 alpha-2) for the tax identifier */
  country: CountryCode;
}

/** Type representation of a termination window */
export interface TerminationWindow {
  /** What cause of termination is this window for? */
  reason: TerminationWindowType;
  /** The length of the period in this termination window (in number of periods of type period_type) */
  period: number;
  /** The type of period being measured (e.g. days or month) */
  period_type: PeriodType;
}

/** Use this where no structured data is available regarding what triggers the conversion of a given security. */
export interface UnspecifiedConversionTrigger extends BaseConversionTrigger {
  type: "UNSPECIFIED";
}

/** Sets forth inputs and conversion mechanism based on valuations */
export interface ValuationBasedConversionMechanism
  extends BaseConversionMechanism {
  type: "VALUATION_BASED_CONVERSION";
  valuation_type: ValuationBasedFormulaType;
  /** If there is a specified valuation figure to use, what is it? Look to `valuation_type` to understand whether this represents, a max valuation (`CAP`), actual valuation at time of exercise (`ACTUAL`) or fixed valuation (`FIXED`). */
  valuation_amount?: Monetary;
  /** How is company capitalization defined for purposes of exercise calculations? If possible, include the legal language from the instrument. */
  capitalization_definition?: string;
  /** The rules for which types of securities would be included in the capitalization definition. */
  capitalization_definition_rules?: CapitalizationDefinitionRules;
}

/** Describes an exact vesting date and amount */
export interface Vesting {
  /** Date the vesting occurred or will occur */
  date: Date;
  /** Quantity of shares which vested or will vest */
  amount: Numeric;
}

/** Describes condition / triggers to be satisfied for vesting to occur */
export interface VestingCondition {
  /** Reference identifier for this condition */
  id: string;
  /** Detailed description of the condition */
  description?: string;
  /** If specified, the fractional part of the whole security that is vested, e.g. 25:100 for 25%. Use `quantity` for a fixed vesting amount. */
  portion?: VestingConditionPortion;
  /** If specified, the fixed amount of the whole security to vest, e.g. 10000 shares. Use `portion` for a proportional vesting amount. */
  quantity?: Numeric;
  /** Describes how this vesting condition is met, resulting in vesting the specified tranche of shares */
  trigger:
    | VestingStartTrigger
    | VestingScheduleAbsoluteTrigger
    | VestingScheduleRelativeTrigger
    | VestingEventTrigger;
  /** List of ALL VestingCondition IDs that can trigger after this one. If there are none, use an empty array.
Conditions should be in priority order in the array, ordered from the highest priority to the lowest. */
  next_condition_ids: string[];
}

/** Describes a fractional portion (ratio) of shares associated with a Vesting Condition */
export interface VestingConditionPortion {
  /** Numerator of the ratio, i.e. the ratio of A to B (A:B) can be expressed as a fraction (A/B), where A is the numerator */
  numerator: Numeric;
  /** Denominator of the ratio, i.e. the ratio of A to B (A:B) can be expressed as a fraction (A/B), where B is the denominator */
  denominator: Numeric;
  /** If false, the ratio is applied to the entire quantity of the security's issuance. If true, it is applied to the amount that has yet to vest. For example:
 A stakeholder has been granted 1000 shares, and 400 are already vested.
If the portion is 1/5 and `remainder` is `false` for a VestingCondition, then that condition will vest 200 shares -- 1/5 of the 1000 granted.
If the portion is 1/5 and `remainder` is `true`, then that condition will vest 120 shares -- 1/5 of the 600 unvested. */
  remainder?: boolean;
}

/** Describes a vesting condition satisfied when a particular unscheduled event occurs */
export interface VestingEventTrigger extends BaseVestingConditionTrigger {
  type: "VESTING_EVENT";
}

/** Describes a period of time expressed in days (e.g. 365 days) for use in Vesting Terms */
export interface VestingPeriodInDays extends BaseVestingPeriod {
  type: "DAYS";
}

/** Describes a period of time expressed in months (e.g. 3 months) for use in Vesting Terms. */
export interface VestingPeriodInMonths extends BaseVestingPeriod {
  type: "MONTHS";
  /** The calendar day of a month to award vesting. */
  day_of_month: VestingDayOfMonth;
}

/** Describes a vesting condition satisfied on an absolute date. */
export interface VestingScheduleAbsoluteTrigger
  extends BaseVestingConditionTrigger {
  type: "VESTING_SCHEDULE_ABSOLUTE";
  /** The date on which this condition triggers. */
  date: Date;
}

/** Describes a vesting condition satisfied when a period of time, relative to another vesting condition, has elapsed. */
export interface VestingScheduleRelativeTrigger
  extends BaseVestingConditionTrigger {
  type: "VESTING_SCHEDULE_RELATIVE";
  /** The span of time that must have elapsed since the condition `relative_to_condition_id` occurred for this condition to trigger. For weeks or "ideal" years (365 days), use `VestingPeriodInDays`. For calendar years use `VestingPeriodInMonths`. */
  period: VestingPeriodInDays | VestingPeriodInMonths;
  /** Reference to the vesting condition ID to which the `period` is relative */
  relative_to_condition_id: string;
}

/** Describes a vesting condition satisfied at the security's vesting commencement date */
export interface VestingStartTrigger extends BaseVestingConditionTrigger {
  type: "VESTING_START_DATE";
}

/** Type representation of a conversion right from a convertible into another non-plan security */
export interface WarrantConversionRight extends BaseConversionRight {
  type?: "WARRANT_CONVERSION_RIGHT";
  /** What conversion mechanism applies to calculate the number of resulting stock class shares? */
  conversion_mechanism:
    | CustomConversionMechanism
    | PercentCapitalizationConversionMechanism
    | FixedAmountConversionMechanism
    | ValuationBasedConversionMechanism
    | SharePriceBasedConversionMechanism;
}

/**
 * Abstract object describing a security acceptance transaction
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseAcceptance {}

/**
 * Abstract object describing fields common to all cancellation transaction objects
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseCancellation {
  /** Identifier for the security that holds the remainder balance (for partial cancellations) */
  balance_security_id?: string;
  /** Reason for the cancellation */
  reason_text: string;
}

/**
 * Abstract object describing a security transfer or secondary sale transaction
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseConsolidation {
  /** Identifier for the security that holds the consolidated balance from this transaction */
  resulting_security_id: string;
  /** Array of identifiers for the security (or securities) being consolidation as a result of the transaction */
  security_ids: string[];
  /** Free-form human-readable reason for stock consolidation */
  reason_text?: string;
}

/**
 * Abstract object describing fields common to all conversion transaction objects
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseConversion {
  /** Identifier for the security (or securities) that resulted from the conversion */
  resulting_security_ids: string[];
}

/**
 * Abstract type setting forth required field(s) for ALL conversion mechanism types
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseConversionMechanism {
  /** Identifies the specific conversion trigger type */
  type: ConversionMechanismType;
}

/**
 * Abstract type representation of a conversion right from a non-plan security into another non-plan security
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseConversionRight {
  /** What kind of conversion right is this? */
  type?: ConversionRightType;
  /** What conversion mechanism applies to calculate the number of resulting securities? */
  conversion_mechanism:
    | SAFEConversionMechanism
    | NoteConversionMechanism
    | CustomConversionMechanism
    | PercentCapitalizationConversionMechanism
    | FixedAmountConversionMechanism
    | RatioConversionMechanism
    | ValuationBasedConversionMechanism
    | SharePriceBasedConversionMechanism;
  /** Is this stock class potentially convertible into a future, as-yet undetermined stock class (e.g. Founder Preferred) */
  converts_to_future_round?: boolean;
  /** The identifier of the existing, known stock class this stock class can convert into */
  converts_to_stock_class_id?: string;
}

/**
 * Abstract type representation of required fields require for conversion rights types.
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseConversionTrigger {
  /** When the trigger condition is met, is the conversion automatic, elective or automatic with an elective right not to convert */
  type: ConversionTriggerType;
  /** Id for this conversion trigger, unique within list of ConversionTriggers in parent convertible issuance's `conversion_triggers` field. */
  trigger_id: string;
  /** Human-friendly nickname to describe the conversion right */
  nickname?: string;
  /** Long-form description of the trigger */
  trigger_description?: string;
  /** When the conditions of the trigger are met, how does the convertible convert? */
  conversion_right:
    | ConvertibleConversionRight
    | WarrantConversionRight
    | StockClassConversionRight;
}

/**
 * Abstract object describing fields common to all exercise transaction objects
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseExercise {
  /** Unstructured text description of consideration provided in exchange for security exercise */
  consideration_text?: string;
  /** Identifier for the security (or securities) that resulted from the exercise */
  resulting_security_ids: string[];
}

/**
 * Abstract file to be extended by all other files
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseFile {
  /** File type field (used to select proper schema for validation) */
  file_type: FileType;
}

/**
 * Abstract object describing fields common to all issuance objects
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseIssuance {
  /** A custom ID for this security (e.g. CN-1.) */
  custom_id: string;
  /** Identifier for the stakeholder that holds legal title to this security */
  stakeholder_id: string;
  /** Date of board approval for the security */
  board_approval_date?: Date;
  /** Date on which the stockholders approved the security */
  stockholder_approval_date?: Date;
  /** Unstructured text description of consideration provided in exchange for security issuance */
  consideration_text?: string;
  /** List of security law exemptions (and applicable jurisdictions) for this security */
  security_law_exemptions: SecurityExemption[];
}

/**
 * Abstract transaction object to be extended by all transaction objects that affect the issuer
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseIssuerTransaction {
  /** Identifier of the Issuer object, a subject of this transaction */
  issuer_id: string;
}

/**
 * Abstract object to be extended by all other objects
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseObject {
  /** Identifier for the object */
  id: string;
  /** Unstructured text comments related to and stored for the object */
  comments?: string[];
  /** Object type field */
  object_type: ObjectType;
}

/**
 * Abstract object describing common properties to a reissuance of a security
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseReissuance {
  /** Identifier of the new security (or securities) issuance resulting from a reissuance */
  resulting_security_ids: string[];
  /** When stock is reissued as a result of a stock split, this field contains id of the respective stock class split transaction. It is not set otherwise. */
  split_transaction_id?: string;
  /** Free-form human-readable reason for stock reissuance */
  reason_text?: string;
}

/**
 * Abstract object describing fields common to all release transaction objects
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseRelease {
  /** The settlement date for the shares released, typically after the release transaction date */
  settlement_date: Date;
  /** The release price used to determine the value of the security at the time of release */
  release_price: Monetary;
  /** Quantity of shares released */
  quantity: Numeric;
  /** Unstructured text description of consideration provided in exchange for security release */
  consideration_text?: string;
  /** Identifier of the new security (or securities) issuance resulting from a release transaction */
  resulting_security_ids: string[];
}

/**
 * Abstract object describing common properties to a repurchase transaction
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseRepurchase {
  /** Repurchase price per share of the stock */
  price: Monetary;
  /** Number of shares of stock repurchased */
  quantity: Numeric;
  /** Unstructured text description of consideration provided in exchange for security repurchase */
  consideration_text?: string;
  /** Identifier for the security that holds the remainder balance (for partial repurchases) */
  balance_security_id?: string;
}

/**
 * Abstract object describing a security retraction transaction
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseRetraction {
  /** Reason for the retraction */
  reason_text: string;
}

/**
 * Abstract object describing a terminal transaction where securities return to a stock plan pool
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseReturnToPool {
  /** Reason for the return to the pool */
  reason_text: string;
  /** How many shares were returned to the pool? */
  quantity: Numeric;
  /** Id of the Stock Plan whose pool the reserved shares should return to. This does not have to be the same pool the securities were issued from as sometimes plan rollovers or other actions taken by the company can result in stock returning to a different pool. */
  stock_plan_id: string;
}

/**
 * Abstract transaction object to be extended by all transaction objects that deal with individual securities
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseSecurityTransaction {
  /** Identifier for the security (stock, plan security, warrant, or convertible) by which it can be referenced by other transaction objects. Note that while this identifier is created with an issuance object, it should be different than the issuance object's `id` field which identifies the issuance transaction object itself. All future transactions on the security (e.g. acceptance, transfer, cancel, etc.) must reference this `security_id` to qualify which security the transaction applies to. */
  security_id: string;
}

/**
 * Abstract change event "transaction" object to be extended by all change event "transaction" objects that affect a stakeholder
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseStakeholderChangeEvent {
  /** Identifier of the Stakeholder object, a subject of this change event "transaction" */
  stakeholder_id: string;
}

/**
 * Abstract transaction object to be extended by all transaction objects that affect the stock class
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseStockClassTransaction {
  /** Identifier of the StockClass object, a subject of this transaction */
  stock_class_id: string;
}

/**
 * Abstract transaction object to be extended by all transaction objects that affect a stock plan
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseStockPlanTransaction {
  /** Identifier of the Stock Plan object, a subject of this transaction */
  stock_plan_id: string;
}

/**
 * Abstract transaction object to be extended by all other transaction objects
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseTransaction {
  /** Date on which the transaction occurred */
  date: Date;
}

/**
 * Abstract object describing a security transfer or secondary sale transaction
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseTransfer {
  /** Unstructured text description of consideration provided in exchange for security transfer */
  consideration_text?: string;
  /** Identifier for the security that holds the remainder balance (for partial transfers) */
  balance_security_id?: string;
  /** Array of identifiers for new security (or securities) created as a result of the transaction */
  resulting_security_ids: string[];
}

/**
 * Abstract type describing fields needed in all triggers types, with a 'trigger' being a condition that must be satisfied for a VestingCondition to be met
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseVestingConditionTrigger {
  /** Identifies the sub-type of trigger */
  type: VestingTriggerType;
}

/**
 * Abstract type describing the fields common to all periods of time (e.g. 3 months, 365 days) for use in Vesting Terms
 * Abstract base extended by concrete schemas; not used for data directly.
 */
export interface BaseVestingPeriod {
  /** The quantity of `type` units of time; e.g. for 3 months, this would be `3`; for 30 days, this would be `30` */
  length: number;
  /** The unit of time for the period, e.g. `MONTHS` or `DAYS` */
  type: PeriodType;
  /** The number of times this vesting period triggers. If vesting occurs monthly for 36 months, for example, this would be `36` */
  occurrences: number;
  /** If specified, the 1-indexed vesting installment at which the cliff condition occurs. If this field is not provided or less than 2, it is treated as as if no cliff applies. */
  cliff_installment?: number;
}

/** Object describing a convertible acceptance transaction */
export interface ConvertibleAcceptance
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseAcceptance {
  object_type: "TX_CONVERTIBLE_ACCEPTANCE";
}

/** Object describing a cancellation of a convertible security */
export interface ConvertibleCancellation
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseCancellation {
  object_type: "TX_CONVERTIBLE_CANCELLATION";
  /** Amount of monetary value cancelled */
  amount: Monetary;
}

/** Object describing a conversion of a convertible security */
export interface ConvertibleConversion
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseConversion {
  object_type: "TX_CONVERTIBLE_CONVERSION";
  /** Reason for the conversion */
  reason_text: string;
  /** Quantity of security units converted */
  quantity_converted?: Numeric;
  /** Identifier for the convertible that holds the remainder balance (for partial conversions) */
  balance_security_id?: string;
  /** What is the id of the convertible's conversion trigger that resulted in this conversion */
  trigger_id: string;
  /** If this conversion event and its `quantity_converted` value was based on the company's capitalization, please specify what stock classes, stock plans and securities were aggregated to calculate the capitalization value used in the calculation (e.g. if it was based on "fully diluted" capitalization, please provide details on how this was calculated using the capitalization type datastructure). */
  capitalization_definition?: CapitalizationDefinition;
}

/** Object describing convertible instrument issuance transaction by the issuer and held by a stakeholder */
export interface ConvertibleIssuance
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseIssuance {
  object_type: "TX_CONVERTIBLE_ISSUANCE";
  /** Amount invested and outstanding on date of issuance of this convertible */
  investment_amount: Monetary;
  /** What kind of convertible instrument is this (of the supported, enumerated types) */
  convertible_type: ConvertibleType;
  /** In event the convertible can convert due to trigger events (e.g. Maturity, Next Qualified Financing, Change of Control, at Election of Holder), what are the terms? */
  conversion_triggers: (
    | AutomaticConversionOnConditionTrigger
    | AutomaticConversionOnDateTrigger
    | ElectiveConversionAtWillTrigger
    | ElectiveConversionInDateRangeTrigger
    | ElectiveConversionOnConditionTrigger
    | UnspecifiedConversionTrigger
  )[];
  /** What pro-rata (if any) is the holder entitled to buy at the next round? */
  pro_rata?: Numeric;
  /** If different convertible instruments have seniorty over one another, use this value to build a seniority stack, with 1 being highest seniority and equal seniority values assumed to be equal priority */
  seniority: number;
}

/** Object describing a retraction of a convertible security */
export interface ConvertibleRetraction
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseRetraction {
  object_type: "TX_CONVERTIBLE_RETRACTION";
}

/** Object describing a transfer or secondary sale of a convertible security */
export interface ConvertibleTransfer
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseTransfer {
  object_type: "TX_CONVERTIBLE_TRANSFER";
  /** Amount of monetary value transferred */
  amount: Monetary;
}

/** Object describing a document */
export interface Document extends BaseObject {
  object_type: "DOCUMENT";
  /** Relative path/filename for the document. Path is understood to be a relative location within an associated ZIP archive (packaged separately from the OCF archive) e.g. './acceptance_records/John_Wayne_2017_Grant_Agreement.pdf' */
  path?: string;
  /** List of objects which this document is related to */
  related_objects?: ObjectReference[];
  /** Uniform resource identifier for the document if not using the `path` property and associated ZIP archive separate from the OCF package. */
  uri?: string;
  /** MD5 file checksum */
  md5: Md5;
}

/** Object describing equity compensation acceptance transaction */
export interface EquityCompensationAcceptance
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseAcceptance {
  /** This is done to avoid a breaking change as we work towards a bigger restructure of the equity types in v2.0.0. `TX_PLAN_SECURITY_ACCEPTANCE` will be deprecated in v2.0.0 */
  object_type:
    | "TX_PLAN_SECURITY_ACCEPTANCE"
    | "TX_EQUITY_COMPENSATION_ACCEPTANCE";
}

/** Object describing a cancellation of equity compensation */
export interface EquityCompensationCancellation
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseCancellation {
  /** This is done to avoid a breaking change as we work towards a bigger restructure of the equity types in v2.0.0. `TX_PLAN_SECURITY_CANCELLATION` will be deprecated in v2.0.0 */
  object_type:
    | "TX_PLAN_SECURITY_CANCELLATION"
    | "TX_EQUITY_COMPENSATION_CANCELLATION";
  /** Quantity of non-monetary security units cancelled */
  quantity: Numeric;
}

/** Object describing equity compensation exercise transaction */
export interface EquityCompensationExercise
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseExercise {
  /** This is done to avoid a breaking change as we work towards a bigger restructure of the equity types in v2.0.0. `TX_PLAN_SECURITY_EXERCISE` will be deprecated in v2.0.0 */
  object_type: "TX_PLAN_SECURITY_EXERCISE" | "TX_EQUITY_COMPENSATION_EXERCISE";
  /** Quantity of shares exercised */
  quantity: Numeric;
}

/** Object describing securities issuance transaction by the issuer and held by a stakeholder as a form of compensation (as noted elsewhere, RSAs are not included here intentionally and should be modelled using Stock Issuances). */
export interface EquityCompensationIssuance
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseIssuance {
  /** This is done to avoid a breaking change as we work towards a bigger restructure of the equity types in v2.0.0. `TX_PLAN_SECURITY_ISSUANCE` will be deprecated in v2.0.0 */
  object_type: "TX_PLAN_SECURITY_ISSUANCE" | "TX_EQUITY_COMPENSATION_ISSUANCE";
  /** If the equity compensation was issued from a plan (don't forget, plan-less options are a thing), what is the plan id. */
  stock_plan_id?: string;
  /** The stock class options will exercise into. Especially important for plan-less options and any issuances from a plan that supports multiple share classes. */
  stock_class_id?: string;
  /** If the plan security is compensation, what kind? */
  compensation_type: CompensationType;
  /** If the plan security is an option, what kind? */
  option_grant_type?: OptionType;
  /** How many shares are subject to this plan security? */
  quantity: Numeric;
  /** If this is an option, what is the exercise price of the option? */
  exercise_price?: Monetary;
  /** If this is a stock appreciation right, what is the base price used to calculate the appreciation of the SAR? */
  base_price?: Monetary;
  /** Is this Equity Compensation exercisable prior to completion of vesting? If so, it's assumed the vesting schedule will remain in effect but, instead of vesting a right to exercise, it becomes the schedule determining when a right to repurchase the resulting stock lapses. */
  early_exercisable?: boolean;
  /** Identifier of the VestingTerms to which this security is subject. If neither `vesting_terms_id` or `vestings` are present then the security is fully vested on issuance. */
  vesting_terms_id?: string;
  /** List of exact vesting dates and amounts for this security. When `vestings` array is present then `vesting_terms_id` may be ignored. */
  vestings?: Vesting[];
  /** Expiration date of the plan security */
  expiration_date: null | Date;
  /** Exercise periods applicable to plan security after a termination for a given, enumerated reason */
  termination_exercise_windows: TerminationWindow[];
}

/** Object describing equity compensation security release transaction */
export interface EquityCompensationRelease
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseRelease {
  /** This is done to avoid a breaking change as we work towards a bigger restructure of the equity types in v2.0.0. `TX_PLAN_SECURITY_RELEASE` will be deprecated in v2.0.0 */
  object_type: "TX_PLAN_SECURITY_RELEASE" | "TX_EQUITY_COMPENSATION_RELEASE";
}

/** Object describing an event that adjusts the exercise price of existing equity compensation, typically done when the current share price falls significantly below the set exercise price, rendering an option underwater. */
export interface EquityCompensationRepricing
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction {
  object_type: "TX_EQUITY_COMPENSATION_REPRICING";
  /** What is the exercise price of the option after the repricing? */
  new_exercise_price: Monetary;
}

/** Object describing a retraction of equity compensation */
export interface EquityCompensationRetraction
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseRetraction {
  /** This is done to avoid a breaking change as we work towards a bigger restructure of the equity types in v2.0.0. `TX_PLAN_SECURITY_RETRACTION` will be deprecated in v2.0.0 */
  object_type:
    | "TX_PLAN_SECURITY_RETRACTION"
    | "TX_EQUITY_COMPENSATION_RETRACTION";
}

/** Object describing a transfer of equity compensation */
export interface EquityCompensationTransfer
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseTransfer {
  /** This is done to avoid a breaking change as we work towards a bigger restructure of the equity types in v2.0.0. `TX_PLAN_SECURITY_TRANSFER` will be deprecated in v2.0.0 */
  object_type: "TX_PLAN_SECURITY_TRANSFER" | "TX_EQUITY_COMPENSATION_TRANSFER";
  /** Quantity of non-monetary security units transferred */
  quantity: Numeric;
}

/** Object describing a financing */
export interface Financing extends BaseObject {
  object_type: "FINANCING";
  /** Name for the financing */
  name: string;
  /** Array of issuance IDs associated with the financing */
  issuance_ids: string[];
  /** Date on which the financing event occurred */
  date: Date;
}

/** Object describing the issuer of the cap table (the company whose cap table this is) */
export interface Issuer extends BaseObject {
  object_type: "ISSUER";
  /** Legal name of the issuer */
  legal_name: string;
  /** Doing Business As name */
  dba?: string;
  /** Date of formation */
  formation_date: Date;
  /** The country where the issuer company was legally formed (ISO 3166-1 alpha-2) */
  country_of_formation: CountryCode;
  /** The code for the state, province, or subdivision where the issuer company was legally formed */
  country_subdivision_of_formation?: CountrySubdivisionCode;
  /** The text name of state, province, or subdivision where the issuer company was legally formed if the code is not available */
  country_subdivision_name_of_formation?: string;
  /** The tax ids for this issuer company */
  tax_ids?: TaxID[];
  /** A work email that the issuer company can be reached at */
  email?: Email;
  /** A phone number that the issuer company can be reached at */
  phone?: Phone;
  /** The headquarters address of the issuing company */
  address?: Address;
  /** The initial number of shares authorized for this issuer */
  initial_shares_authorized?: AuthorizedShares | Numeric;
}

/** Object describing an event to change the number of authorized shares at the issuer level. */
export interface IssuerAuthorizedSharesAdjustment
  extends BaseObject,
    BaseTransaction,
    BaseIssuerTransaction {
  object_type: "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT";
  /** The new number of shares authorized for this issuer as of the event of this transaction */
  new_shares_authorized: Numeric;
  /** Date on which the board approved the change to the issuer */
  board_approval_date?: Date;
  /** Date on which the stockholders approved the change to the issuer */
  stockholder_approval_date?: Date;
}

/** An object that represents a plan security acceptance transaction, which is just a compatibility wrapper for an Equity Compensation Acceptance. */
export type PlanSecurityAcceptance = EquityCompensationAcceptance;

/** Object describing a plan security cancellation (which is a compatibility wrapper for Equity Compensation Cancellation) */
export type PlanSecurityCancellation = EquityCompensationCancellation;

/** Object for a plan security exercise (which is a compatibility wrapper for Equity Compensation Exercise) */
export type PlanSecurityExercise = EquityCompensationExercise;

/** A Plan Security Issuance is a transaction to issue plan securities (it's a compatibility wrapper for Equity Compensation Issuances) */
export type PlanSecurityIssuance = EquityCompensationIssuance;

/** Object describing plan security release transaction (a compatibility wrapper for equity compensation release event */
export type PlanSecurityRelease = EquityCompensationRelease;

/** Object describing plan security retraction transaction (a compatibility wrapper for equity compensation retraction event) */
export type PlanSecurityRetraction = EquityCompensationRetraction;

/** Object describing plan security transfer transaction (a compatibility wrapper for equity compensation transfer event) */
export type PlanSecurityTransfer = EquityCompensationTransfer;

/** Object describing a stakeholder */
export interface Stakeholder extends BaseObject {
  object_type: "STAKEHOLDER";
  /** Name for the stakeholder */
  name: Name;
  /** Distinguish individuals from institutions */
  stakeholder_type: StakeholderType;
  /** This might be any sort of id assigned to the stakeholder by the issuer, such as an internal company ID for an employee stakeholder */
  issuer_assigned_id?: string;
  /** What is the current relationship of the stakeholder to the issuer? */
  current_relationship?: StakeholderRelationshipType;
  /** What is/are the current relationship(s) of the stakeholder to the issuer? */
  current_relationships?: StakeholderRelationshipType[];
  /** What is the current activity status of the stakeholder? */
  current_status?: StakeholderStatusType;
  /** The primary contact info for an institutional stakeholder */
  primary_contact?: ContactInfo;
  /** The contact info for an individual stakeholder */
  contact_info?: ContactInfoWithoutName;
  /** Addresses for the stakeholder */
  addresses?: Address[];
  /** The tax ids for this stakeholder */
  tax_ids?: TaxID[];
}

/** Object describing a change event for the relationship(s) between the stakeholder and the issuer */
export interface StakeholderRelationshipChangeEvent
  extends BaseObject,
    BaseTransaction,
    BaseStakeholderChangeEvent {
  object_type: "CE_STAKEHOLDER_RELATIONSHIP";
  /** Denoting the beginning of this relationship on the change date */
  relationship_started?: StakeholderRelationshipType;
  /** Denoting the ending of this relationship on the change date */
  relationship_ended?: StakeholderRelationshipType;
}

/** Object describing a change event for the activity status of this stakeholder */
export interface StakeholderStatusChangeEvent
  extends BaseObject,
    BaseTransaction,
    BaseStakeholderChangeEvent {
  object_type: "CE_STAKEHOLDER_STATUS";
  /** Denoting the beginning of this activity status on the change date */
  new_status: StakeholderStatusType;
}

/** Object describing a stock acceptance transaction */
export interface StockAcceptance
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseAcceptance {
  object_type: "TX_STOCK_ACCEPTANCE";
}

/** Object describing a cancellation of a stock security */
export interface StockCancellation
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseCancellation {
  object_type: "TX_STOCK_CANCELLATION";
  /** Quantity of non-monetary security units cancelled */
  quantity: Numeric;
}

/** Object describing a class of stock issued by the issuer */
export interface StockClass extends BaseObject {
  object_type: "STOCK_CLASS";
  /** Name for the stock type (e.g. Series A Preferred or Class A Common) */
  name: string;
  /** The type of this stock class (e.g. Preferred or Common) */
  class_type: StockClassType;
  /** Default prefix for certificate numbers in certificated shares (e.g. CS- in CS-1). If certificate IDs have a dash, the prefix should end in the dash like CS- */
  default_id_prefix: string;
  /** The initial number of shares authorized for this stock class */
  initial_shares_authorized: AuthorizedShares | Numeric;
  /** Date on which the board approved the stock class */
  board_approval_date?: Date;
  /** Date on which the stockholders approved the stock class */
  stockholder_approval_date?: Date;
  /** The number of votes each share of this stock class gets */
  votes_per_share: Numeric;
  /** Per-share par value of this stock class */
  par_value?: Monetary;
  /** Per-share price this stock class was issued for */
  price_per_share?: Monetary;
  /** Seniority of the stock - determines repayment priority. Seniority is ordered by increasing number so that stock classes with a higher seniority have higher repayment priority. The following properties hold for all stock classes for a given company: 
a) transitivity: stock classes are absolutely stackable by seniority and in increasing numerical order, 
b) non-uniqueness: multiple stock classes can have the same Seniority number and therefore have the same liquidation/repayment order.
In practice, stock classes with same seniority may be created at different points in time and (for example, an extension of an existing preferred financing round), and also a new stock class can be created with seniority between two existing stock classes, in which case it is assigned some decimal number between the numbers representing seniority of the respective classes. */
  seniority: Numeric;
  /** List of stock class conversion rights possible for this stock class */
  conversion_rights?: StockClassConversionRight[];
  /** The liquidation preference per share for this stock class */
  liquidation_preference_multiple?: Numeric;
  /** The participation cap multiple per share for this stock class */
  participation_cap_multiple?: Numeric;
}

/** Object describing an event to change the number of authorized shares of a stock class. */
export interface StockClassAuthorizedSharesAdjustment
  extends BaseObject,
    BaseTransaction,
    BaseStockClassTransaction {
  object_type: "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT";
  /** The new number of shares authorized for this stock class as of the event of this transaction */
  new_shares_authorized: Numeric;
  /** Date on which the board approved the change to the stock class */
  board_approval_date?: Date;
  /** This optional field tracks when the stockholders approved the change to the stock class. */
  stockholder_approval_date?: Date;
}

/** Object describing the conversion ratio adjustment of a stock class that has a RatioConversionMechanism conversion mechanism where there was an actual repricing due to a down-round. The actual determination of the new conversion ratio / conversion price is calculated outside of OCF, so the specific mechanism - e.g. broad-based weighted-average anti-dilution protection vs. full ratchet anti-dilution protection. */
export interface StockClassConversionRatioAdjustment
  extends BaseObject,
    BaseTransaction,
    BaseStockClassTransaction {
  object_type: "TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT";
  /** New conversion ratio mechanism describing new conversion price and conversion ratio in effect following a repricing - based on original issue price to new conversion price (provided in this transaction). For 2-for-1 split the numerator of the ratio is 2 and the denominator is 1. */
  new_ratio_conversion_mechanism: RatioConversionMechanism;
}

/** Object describing a split of a stock class */
export interface StockClassSplit
  extends BaseObject,
    BaseTransaction,
    BaseStockClassTransaction {
  object_type: "TX_STOCK_CLASS_SPLIT";
  /** Ratio of new shares to old shares. For 2-for-1 split the numerator of the ratio is 2 and the denominator is 1. */
  split_ratio: Ratio;
}

/** Object describing a consolidation of stock positions */
export interface StockConsolidation
  extends BaseObject,
    BaseTransaction,
    BaseConsolidation {
  object_type: "TX_STOCK_CONSOLIDATION";
}

/** Object describing a conversion of stock */
export interface StockConversion
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseConversion {
  object_type: "TX_STOCK_CONVERSION";
  /** Identifier for the security that holds the remainder balance (for partial conversions) */
  balance_security_id?: string;
  /** Quantity of non-monetary security units converted */
  quantity_converted: Numeric;
}

/** Object describing a stock issuance transaction by the issuer and held by a stakeholder */
export interface StockIssuance
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseIssuance {
  object_type: "TX_STOCK_ISSUANCE";
  /** Identifier of the stock class for this stock issuance */
  stock_class_id: string;
  /** Identifier of StockPlan the Stock was issued from (in the case of RSAs or Stock issued from a plan). */
  stock_plan_id?: string;
  /** Range(s) of the specific share numbers included in this issuance. This is different from a certificate number you might include in the `custom_id` field or the `security_id` created in this issuance. This field should be used where, for whatever reason, shares are not fungible and you must track, with each issuance, *which* specific share numbers are included in the issuance - e.g. share numbers 1 - 100 and 250-300. */
  share_numbers_issued?: ShareNumberRange[];
  /** The price per share paid for the stock by the holder */
  share_price: Monetary;
  /** Number of shares issued to the stakeholder */
  quantity: Numeric;
  /** Identifier of the VestingTerms to which this security is subject. If neither `vesting_terms_id` or `vestings` are present then the security is fully vested on issuance. */
  vesting_terms_id?: string;
  /** List of exact vesting dates and amounts for this security. When `vestings` array is present then `vesting_terms_id` may be ignored. */
  vestings?: Vesting[];
  /** The cost basis for this particular stock */
  cost_basis?: Monetary;
  /** List of stock legend ids that apply to this stock */
  stock_legend_ids: string[];
  /** Optional field to flag certain special types of issuances (like RSAs) */
  issuance_type?: StockIssuanceType;
}

/** Object describing a stock legend template */
export interface StockLegendTemplate extends BaseObject {
  object_type: "STOCK_LEGEND_TEMPLATE";
  /** Name for the stock legend template */
  name: string;
  /** The full text of the stock legend */
  text: string;
}

/** Object describing a plan which stock options are issued from */
export interface StockPlan extends BaseObject {
  object_type: "STOCK_PLAN";
  /** Name for the stock plan */
  plan_name: string;
  /** Date on which board approved the plan */
  board_approval_date?: Date;
  /** This optional field tracks when the stockholders approved this stock plan. This is intended for use by US companies that want to issue Incentive Stock Options (ISOs), as the issuing StockPlan must receive shareholder approval within a specified time frame in order to issue valid ISOs. */
  stockholder_approval_date?: Date;
  /** The initial number of shares reserved in the pool for this stock plan by the Board or equivalent body. */
  initial_shares_reserved: Numeric;
  /** If a security issued under this Stock Plan is cancelled, what happens to the reserved shares by default? NOTE: for any given security issued from the pool, the Plan's default cancellation behavior can be overridden by subsequent transactions cancelling the reserved stock, returning it to pool or marking it as capital stock. The event chain should always control - do not rely on this field and fail to traverse the events. */
  default_cancellation_behavior?: StockPlanCancellationBehaviorType;
  /** [DEPRECATED in favor of stock_class_ids] Identifier of the StockClass object this plan is composed of. */
  stock_class_id?: string;
  /** Identifiers of StockClass objects this plan is composed of */
  stock_class_ids?: string[];
}

/** Object describing the change in the size of a Stock Plan pool. */
export interface StockPlanPoolAdjustment
  extends BaseObject,
    BaseTransaction,
    BaseStockPlanTransaction {
  object_type: "TX_STOCK_PLAN_POOL_ADJUSTMENT";
  /** Date on which board approved the change to the plan. */
  board_approval_date?: Date;
  /** This optional field tracks when the stockholders approved this change to the stock plan. This is intended for use by US companies that want to issue Incentive Stock Options (ISOs), as the issuing StockPlan must receive shareholder approval within a specified time frame in order to issue valid ISOs. */
  stockholder_approval_date?: Date;
  /** The number of shares reserved in the pool for this stock plan by the Board or equivalent body as of the effective date of this pool adjustment. */
  shares_reserved: Numeric;
}

/** Object describing which stock plan pool a particular security's shares were returned to upon cancellation. */
export interface StockPlanReturnToPool
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseStockPlanTransaction,
    BaseReturnToPool {
  object_type: "TX_STOCK_PLAN_RETURN_TO_POOL";
}

/** Object describing a re-issuance of stock */
export interface StockReissuance
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseReissuance {
  object_type: "TX_STOCK_REISSUANCE";
}

/** Object describing a stock repurchase transaction */
export interface StockRepurchase
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseRepurchase {
  object_type: "TX_STOCK_REPURCHASE";
}

/** Object describing a retraction of a stock security */
export interface StockRetraction
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseRetraction {
  object_type: "TX_STOCK_RETRACTION";
}

/** Object describing a transfer or secondary sale of a stock security */
export interface StockTransfer
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseTransfer {
  object_type: "TX_STOCK_TRANSFER";
  /** Quantity of non-monetary security units transferred */
  quantity: Numeric;
}

/** Object describing a valuation used in the cap table */
export interface Valuation extends BaseObject {
  object_type: "VALUATION";
  /** Entity which provided the valuation */
  provider?: string;
  /** Date on which board approved the valuation. This is essential for 409A valuations, in particular, which require the Board to approve the valuation. */
  board_approval_date?: Date;
  /** This optional field tracks when the stockholders approved the valuation. */
  stockholder_approval_date?: Date;
  /** Valued price per share */
  price_per_share: Monetary;
  /** Date on which this valuation is first valid */
  effective_date: Date;
  /** Identifier of the stock class for this valuation */
  stock_class_id: string;
  /** Seam for supporting different types of valuations in future versions */
  valuation_type: ValuationType;
}

/** Object describing an acceleration of vesting, in which additional shares vest ahead of the schedule specified in security's vesting terms. */
export interface VestingAcceleration
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction {
  object_type: "TX_VESTING_ACCELERATION";
  /** Number of shares vesting ahead of schedule */
  quantity: Numeric;
  /** Reason for the acceleration; unstructured text */
  reason_text: string;
}

/** Object describing the transaction of an non-schedule-driven vesting event associated with a security */
export interface VestingEvent
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction {
  object_type: "TX_VESTING_EVENT";
  /** Reference to the `id` of a VestingCondition in this security's VestingTerms. This condition should have a trigger type of `VESTING_EVENT`. */
  vesting_condition_id: string;
}

/** Object describing the transaction of vesting schedule start / commencement associated with a security */
export interface VestingStart
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction {
  object_type: "TX_VESTING_START";
  /** Reference to the `id` of a VestingCondition in this security's VestingTerms. This condition should have a trigger type of `VESTING_START_DATE`. */
  vesting_condition_id: string;
}

/** Object describing the terms under which a security vests */
export interface VestingTerms extends BaseObject {
  object_type: "VESTING_TERMS";
  /** Concise name for the vesting schedule */
  name: string;
  /** Detailed description of the vesting schedule */
  description: string;
  /** Allocation/rounding type for the vesting schedule */
  allocation_type: AllocationType;
  /** Conditions and triggers that describe the graph of vesting schedules and events */
  vesting_conditions: VestingCondition[];
}

/** Object describing a warrant acceptance transaction */
export interface WarrantAcceptance
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseAcceptance {
  object_type: "TX_WARRANT_ACCEPTANCE";
}

/** Object describing a cancellation of a warrant security */
export interface WarrantCancellation
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseCancellation {
  object_type: "TX_WARRANT_CANCELLATION";
  /** Quantity of non-monetary security units cancelled */
  quantity: Numeric;
}

/** Object describing a warrant exercise transaction */
export interface WarrantExercise
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseExercise {
  object_type: "TX_WARRANT_EXERCISE";
  /** What is the id of the warrant's exercise trigger that resulted in this exercise */
  trigger_id: string;
}

/** Object describing warrant issuance transaction by the issuer and held by a stakeholder */
export interface WarrantIssuance
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseIssuance {
  object_type: "TX_WARRANT_ISSUANCE";
  /** Quantity of shares the warrant is exercisable for */
  quantity?: Numeric;
  /** The exercise price of the warrant */
  exercise_price?: Monetary;
  /** Actual purchase price of the warrant (sum up purported value of all consideration, including in-kind) */
  purchase_price: Monetary;
  /** In event the Warrant can convert due to trigger events (e.g. Maturity, Next Qualified Financing, Change of Control, at Election of Holder), what are the terms? */
  exercise_triggers: (
    | AutomaticConversionOnConditionTrigger
    | AutomaticConversionOnDateTrigger
    | ElectiveConversionAtWillTrigger
    | ElectiveConversionInDateRangeTrigger
    | ElectiveConversionOnConditionTrigger
    | UnspecifiedConversionTrigger
  )[];
  /** What is expiration date of the warrant (if applicable) */
  warrant_expiration_date?: Date;
  /** Identifier of the VestingTerms to which this security is subject. If neither `vesting_terms_id` or `vestings` are present then the security is fully vested on issuance. */
  vesting_terms_id?: string;
  /** List of exact vesting dates and amounts for this security. When `vestings` array is present then `vesting_terms_id` may be ignored. */
  vestings?: Vesting[];
  /** If quantity is provided, use this to specify where the number came from - e.g. was it a fixed value from the instrument (`INSTRUMENT_FIXED`), a human estimate (`HUMAN_ESTIMATED`), etc. If quantity is provided and this field is not, this is assumed to be `UNSPECIFIED` */
  quantity_source?: QuantitySourceType;
}

/** Object describing a retraction of a warrant security */
export interface WarrantRetraction
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseRetraction {
  object_type: "TX_WARRANT_RETRACTION";
}

/** Object describing a transfer or secondary sale of a warrant security */
export interface WarrantTransfer
  extends BaseObject,
    BaseTransaction,
    BaseSecurityTransaction,
    BaseTransfer {
  object_type: "TX_WARRANT_TRANSFER";
  /** Quantity of non-monetary security units transferred */
  quantity: Numeric;
}

/** JSON containing file type identifier and list of document objects */
export interface DocumentsFile extends BaseFile {
  /** List of OCF document objects */
  items: Document[];
  file_type: "OCF_DOCUMENTS_FILE";
}

/** JSON containing file type identifier and list of financings */
export interface FinancingsFile extends BaseFile {
  /** List of OCF financing objects */
  items: Financing[];
  file_type: "OCF_FINANCINGS_FILE";
}

/** Top-level schema describing the OCF Manifest, which holds issuer information and references ocf files containing transactions, stakeholders, stock classes, etc. */
export interface OCFManifestFile extends BaseFile {
  /** OCF Version Identifier -- the current semantic version (https://semver.org/spec/v2.0.0.html) */
  ocf_version: "1.2.1-alpha+main";
  file_type: "OCF_MANIFEST_FILE";
  /** Issuer for the cap table */
  issuer: Issuer;
  /** The point-in-time represented by this OCF Package */
  as_of: Date;
  /** Timestamp of when the package was generated. Useful when determining which set of data is most up-to-date, if presented with two packages that have the same `as_of` date, but different cap table data. */
  generated_at: string;
  /** Unstructured text comments related to and stored for the cap table */
  comments?: string[];
  /** List of files containing lists of issuer stock plans, indexed from the file containing the first such object created to the file containing the last (See separate /schema/files/stock_plans_file schema to validate loaded files) */
  stock_plans_files: File[];
  /** List of files containing lists of issuer stock legend templates, indexed from the file containing the first such object created to the file containing the last (See separate /schema/files/stock_legend_templates_file schema to validate loaded files) */
  stock_legend_templates_files: File[];
  /** List of files containing lists of issuer stock classes, indexed from the file containing the first such object created to the file containing the last (See separate /schema/files/stock_classes_file schema to validate loaded files) */
  stock_classes_files: File[];
  /** List of files containing lists of issuer vesting terms, indexed from the file containing the first such object created to the file containing the last (See separate /schema/files/vesting_terms_file schema to validate loaded files) */
  vesting_terms_files: File[];
  /** List of files containing lists of issuer valuations, indexed from the file containing the first such object created to the file containing the last (See separate /schema/files/valuations_file schema to validate loaded files) */
  valuations_files: File[];
  /** List of files containing lists of issuer transactions, indexed from the file containing the first such object created to the file containing the last (See separate /schema/files/transactions_file schema to validate loaded files) */
  transactions_files: File[];
  /** List of files containing lists of issuer stakeholders, indexed from the file containing the first such object created to the file containing the last (See separate /schema/files/stakeholders_file schema to validate loaded files) */
  stakeholders_files: File[];
  /** List of files containing lists of financings, indexed from the file containing the first such object created to the file containing the last (See separate /schema/files/financings_file schema to validate loaded files) */
  financings_files?: File[];
  /** List of files containing lists of document paths, indexed from the file containing the first such object created to the file containing the last (See separate /schema/files/documents_file schema to validate loaded files) */
  documents_files?: File[];
}

/** JSON containing file type identifier and list of stakeholders */
export interface StakeholdersFile extends BaseFile {
  /** List of OCF stakeholder objects */
  items: Stakeholder[];
  file_type: "OCF_STAKEHOLDERS_FILE";
}

/** JSON containing file type identifier and list of stock classes */
export interface StockClassesFile extends BaseFile {
  /** List of OCF stock class objects */
  items: StockClass[];
  file_type: "OCF_STOCK_CLASSES_FILE";
}

/** JSON containing file type identifier and list of stock legend templates */
export interface StockLegendTemplatesFile extends BaseFile {
  /** List of OCF stock legend template objects */
  items: StockLegendTemplate[];
  file_type: "OCF_STOCK_LEGEND_TEMPLATES_FILE";
}

/** JSON containing file type identifier and list of stock plans */
export interface StockPlansFile extends BaseFile {
  /** List of OCF stock plan objects */
  items: StockPlan[];
  file_type: "OCF_STOCK_PLANS_FILE";
}

/** JSON containing file type identifier and list transactions */
export interface TransactionsFile extends BaseFile {
  /** List of OCF transaction objects */
  items: (
    | ConvertibleAcceptance
    | EquityCompensationAcceptance
    | StockAcceptance
    | WarrantAcceptance
    | ConvertibleCancellation
    | EquityCompensationCancellation
    | StockCancellation
    | WarrantCancellation
    | ConvertibleConversion
    | StockConversion
    | EquityCompensationExercise
    | WarrantExercise
    | ConvertibleIssuance
    | EquityCompensationIssuance
    | StockIssuance
    | WarrantIssuance
    | StockReissuance
    | StockConsolidation
    | StockRepurchase
    | EquityCompensationRelease
    | ConvertibleRetraction
    | EquityCompensationRetraction
    | StockRetraction
    | WarrantRetraction
    | StockPlanReturnToPool
    | StockClassSplit
    | StockClassConversionRatioAdjustment
    | StockClassAuthorizedSharesAdjustment
    | ConvertibleTransfer
    | EquityCompensationTransfer
    | StockTransfer
    | WarrantTransfer
    | VestingAcceleration
    | VestingStart
    | VestingEvent
    | StockPlanPoolAdjustment
  )[];
  file_type: "OCF_TRANSACTIONS_FILE";
}

/** JSON containing file type identifier and list of valuations */
export interface ValuationsFile extends BaseFile {
  /** List of OCF valuation objects */
  items: Valuation[];
  file_type: "OCF_VALUATIONS_FILE";
}

/** JSON containing file type identifier and list of vesting terms */
export interface VestingTermsFile extends BaseFile {
  /** List of OCF vesting terms objects */
  items: VestingTerms[];
  file_type: "OCF_VESTING_TERMS_FILE";
}

export type AnyObject =
  | ConvertibleAcceptance
  | ConvertibleCancellation
  | ConvertibleConversion
  | ConvertibleIssuance
  | ConvertibleRetraction
  | ConvertibleTransfer
  | Document
  | EquityCompensationAcceptance
  | EquityCompensationCancellation
  | EquityCompensationExercise
  | EquityCompensationIssuance
  | EquityCompensationRelease
  | EquityCompensationRepricing
  | EquityCompensationRetraction
  | EquityCompensationTransfer
  | Financing
  | Issuer
  | IssuerAuthorizedSharesAdjustment
  | Stakeholder
  | StakeholderRelationshipChangeEvent
  | StakeholderStatusChangeEvent
  | StockAcceptance
  | StockCancellation
  | StockClass
  | StockClassAuthorizedSharesAdjustment
  | StockClassConversionRatioAdjustment
  | StockClassSplit
  | StockConsolidation
  | StockConversion
  | StockIssuance
  | StockLegendTemplate
  | StockPlan
  | StockPlanPoolAdjustment
  | StockPlanReturnToPool
  | StockReissuance
  | StockRepurchase
  | StockRetraction
  | StockTransfer
  | Valuation
  | VestingAcceleration
  | VestingEvent
  | VestingStart
  | VestingTerms
  | WarrantAcceptance
  | WarrantCancellation
  | WarrantExercise
  | WarrantIssuance
  | WarrantRetraction
  | WarrantTransfer;

export type AnyTransaction =
  | ConvertibleAcceptance
  | ConvertibleCancellation
  | ConvertibleConversion
  | ConvertibleIssuance
  | ConvertibleRetraction
  | ConvertibleTransfer
  | EquityCompensationAcceptance
  | EquityCompensationCancellation
  | EquityCompensationExercise
  | EquityCompensationIssuance
  | EquityCompensationRelease
  | EquityCompensationRepricing
  | EquityCompensationRetraction
  | EquityCompensationTransfer
  | IssuerAuthorizedSharesAdjustment
  | StakeholderRelationshipChangeEvent
  | StakeholderStatusChangeEvent
  | StockAcceptance
  | StockCancellation
  | StockClassAuthorizedSharesAdjustment
  | StockClassConversionRatioAdjustment
  | StockClassSplit
  | StockConsolidation
  | StockConversion
  | StockIssuance
  | StockPlanPoolAdjustment
  | StockPlanReturnToPool
  | StockReissuance
  | StockRepurchase
  | StockRetraction
  | StockTransfer
  | VestingAcceleration
  | VestingEvent
  | VestingStart
  | WarrantAcceptance
  | WarrantCancellation
  | WarrantExercise
  | WarrantIssuance
  | WarrantRetraction
  | WarrantTransfer;

export type AnyFile =
  | DocumentsFile
  | FinancingsFile
  | OCFManifestFile
  | StakeholdersFile
  | StockClassesFile
  | StockLegendTemplatesFile
  | StockPlansFile
  | TransactionsFile
  | ValuationsFile
  | VestingTermsFile;

export interface ObjectTypeMap {
  CE_STAKEHOLDER_RELATIONSHIP: StakeholderRelationshipChangeEvent;
  CE_STAKEHOLDER_STATUS: StakeholderStatusChangeEvent;
  DOCUMENT: Document;
  FINANCING: Financing;
  ISSUER: Issuer;
  STAKEHOLDER: Stakeholder;
  STOCK_CLASS: StockClass;
  STOCK_LEGEND_TEMPLATE: StockLegendTemplate;
  STOCK_PLAN: StockPlan;
  TX_CONVERTIBLE_ACCEPTANCE: ConvertibleAcceptance;
  TX_CONVERTIBLE_CANCELLATION: ConvertibleCancellation;
  TX_CONVERTIBLE_CONVERSION: ConvertibleConversion;
  TX_CONVERTIBLE_ISSUANCE: ConvertibleIssuance;
  TX_CONVERTIBLE_RETRACTION: ConvertibleRetraction;
  TX_CONVERTIBLE_TRANSFER: ConvertibleTransfer;
  TX_EQUITY_COMPENSATION_ACCEPTANCE: EquityCompensationAcceptance;
  TX_EQUITY_COMPENSATION_CANCELLATION: EquityCompensationCancellation;
  TX_EQUITY_COMPENSATION_EXERCISE: EquityCompensationExercise;
  TX_EQUITY_COMPENSATION_ISSUANCE: EquityCompensationIssuance;
  TX_EQUITY_COMPENSATION_RELEASE: EquityCompensationRelease;
  TX_EQUITY_COMPENSATION_REPRICING: EquityCompensationRepricing;
  TX_EQUITY_COMPENSATION_RETRACTION: EquityCompensationRetraction;
  TX_EQUITY_COMPENSATION_TRANSFER: EquityCompensationTransfer;
  TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT: IssuerAuthorizedSharesAdjustment;
  TX_PLAN_SECURITY_ACCEPTANCE: EquityCompensationAcceptance;
  TX_PLAN_SECURITY_CANCELLATION: EquityCompensationCancellation;
  TX_PLAN_SECURITY_EXERCISE: EquityCompensationExercise;
  TX_PLAN_SECURITY_ISSUANCE: EquityCompensationIssuance;
  TX_PLAN_SECURITY_RELEASE: EquityCompensationRelease;
  TX_PLAN_SECURITY_RETRACTION: EquityCompensationRetraction;
  TX_PLAN_SECURITY_TRANSFER: EquityCompensationTransfer;
  TX_STOCK_ACCEPTANCE: StockAcceptance;
  TX_STOCK_CANCELLATION: StockCancellation;
  TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT: StockClassAuthorizedSharesAdjustment;
  TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT: StockClassConversionRatioAdjustment;
  TX_STOCK_CLASS_SPLIT: StockClassSplit;
  TX_STOCK_CONSOLIDATION: StockConsolidation;
  TX_STOCK_CONVERSION: StockConversion;
  TX_STOCK_ISSUANCE: StockIssuance;
  TX_STOCK_PLAN_POOL_ADJUSTMENT: StockPlanPoolAdjustment;
  TX_STOCK_PLAN_RETURN_TO_POOL: StockPlanReturnToPool;
  TX_STOCK_REISSUANCE: StockReissuance;
  TX_STOCK_REPURCHASE: StockRepurchase;
  TX_STOCK_RETRACTION: StockRetraction;
  TX_STOCK_TRANSFER: StockTransfer;
  TX_VESTING_ACCELERATION: VestingAcceleration;
  TX_VESTING_EVENT: VestingEvent;
  TX_VESTING_START: VestingStart;
  TX_WARRANT_ACCEPTANCE: WarrantAcceptance;
  TX_WARRANT_CANCELLATION: WarrantCancellation;
  TX_WARRANT_EXERCISE: WarrantExercise;
  TX_WARRANT_ISSUANCE: WarrantIssuance;
  TX_WARRANT_RETRACTION: WarrantRetraction;
  TX_WARRANT_TRANSFER: WarrantTransfer;
  VALUATION: Valuation;
  VESTING_TERMS: VestingTerms;
}

export interface FileTypeMap {
  OCF_DOCUMENTS_FILE: DocumentsFile;
  OCF_FINANCINGS_FILE: FinancingsFile;
  OCF_MANIFEST_FILE: OCFManifestFile;
  OCF_STAKEHOLDERS_FILE: StakeholdersFile;
  OCF_STOCK_CLASSES_FILE: StockClassesFile;
  OCF_STOCK_LEGEND_TEMPLATES_FILE: StockLegendTemplatesFile;
  OCF_STOCK_PLANS_FILE: StockPlansFile;
  OCF_TRANSACTIONS_FILE: TransactionsFile;
  OCF_VALUATIONS_FILE: ValuationsFile;
  OCF_VESTING_TERMS_FILE: VestingTermsFile;
}
