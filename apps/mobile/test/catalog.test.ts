import { filterProfessionals } from "../src/catalog";
import { professionals } from "../src/demo/catalog";
test("search handles accents, whitespace, category intersections and empty results", () => {
  expect(
    filterProfessionals(professionals, "  ELETRICOS  ").map((p) => p.id),
  ).toEqual(["ana"]);
  expect(filterProfessionals(professionals, "ana", "hidraulica")).toEqual([]);
  expect(
    filterProfessionals(professionals, "", "eletrica").map((p) => p.id),
  ).toEqual(["ana"]);
  expect(filterProfessionals(professionals, "sem resultado")).toEqual([]);
});
