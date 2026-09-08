/** Exact Quantity inputs shared with the owning CEL numeric-literal tests. */
export const QUANTITY_EXAMPLE_DECLARATION = `concept "Body Weight":
- shape is Record.
- type is Observation.
- value type is Quantity.
- code is \`weight\`.
- shape reduction is most recent.
`;

export const QUANTITY_EXAMPLE_POLICY = `library "L".\n${QUANTITY_EXAMPLE_DECLARATION}`;

export const QUANTITY_EXAMPLE_FACT = `fact "F":
- value is 90 'kg'.
- defined by "L"."Body Weight".`;
