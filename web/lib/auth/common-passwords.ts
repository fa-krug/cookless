// Subset of Django's 20k CommonPasswordValidator list — covers the realistic weak
// passwords the ported tests assert against. Fidelity trade-off acknowledged in the
// migration design (we give up the batteries-included Django auth stack).
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password", "password1", "password123", "passw0rd", "123456", "1234567",
  "12345678", "123456789", "1234567890", "qwerty", "qwerty123", "abc123",
  "111111", "123123", "000000", "iloveyou", "admin", "welcome", "monkey",
  "dragon", "letmein", "football", "princess", "sunshine", "shadow",
  "master", "superman", "trustno1", "baseball", "whatever", "starwars",
]);
