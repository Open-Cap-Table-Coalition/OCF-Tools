import { ISOCalculator } from "iso_nso_calculator";
import { OcfPackageContent, readOcfPackage } from "../read_ocf_package";

const packagePath = "./sample_ocf_folders/acme_holdings_limited";
const stakeholderId = "emilyEmployee";

export function getIsoNsoResults() {
  const ocfPackage: OcfPackageContent = readOcfPackage(packagePath);
  const calculator = new ISOCalculator(ocfPackage);
  return calculator.execute(stakeholderId);
}

if (require.main === module) {
  const results = getIsoNsoResults();

  const years: number[] = [];
  results.map((result) => {
    if (!years.includes(result.Year)) {
      years.push(result.Year);
    }
  });

  years.forEach((year) => {
    const resultsByYear = results.filter((result) => result.Year === year);
    console.table(resultsByYear);
  });
}
