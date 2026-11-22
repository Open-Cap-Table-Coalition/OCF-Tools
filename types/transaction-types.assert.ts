import type { CurrentTxKey, OLDER_NAMES } from "../ocf_validator/constants/constants";
import type { TxKey } from "../ocf_validator/ocfMachine";
import type { Expect, Equal } from "./type-assert";

// Every current type needs a sort position. Older names take the position of the type they map to.
type _RanksEveryCurrentType = Expect<Equal<CurrentTxKey, Exclude<TxKey, keyof typeof OLDER_NAMES>>>;
