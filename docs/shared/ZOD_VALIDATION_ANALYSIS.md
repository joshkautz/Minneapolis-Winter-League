# Zod Validation Analysis & Improvements

## Current State Analysis

After analyzing all Zod usage throughout the React application, I identified several areas for improvement and implemented best practices upgrades.

## Key Issues Identified

### 1. **Schema Duplication**

- Multiple forms had identical validation logic repeated
- Email/password validation differed across auth forms
- Team name validation was duplicated across create/edit forms

### 2. **Underutilized Shared Schemas**

- Good shared schemas existed in `validation.ts` but weren't used consistently
- Many forms created their own schemas instead of reusing shared ones

### 3. **Missing Advanced Zod Features**

- No use of `z.transform()` for data normalization
- Limited use of `z.refine()` for custom validation
- No `z.preprocess()` for input preprocessing
- Missing schema composition patterns

### 4. **Inconsistent Validation Strength**

- Weak password requirements (some 6+ chars, others just non-empty)
- Inconsistent error messages
- No input normalization (trimming, casing)

## Improvements Implemented

### ✅ 1. Enhanced Shared Schema Library

Created centralized, robust schemas in `/src/shared/utils/validation.ts`:

```typescript
// Advanced email validation with normalization
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Please enter a valid email address")
  .transform((email) => email.toLowerCase());

// Strong password requirements
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .refine((password) => {
    const commonPasswords = ["password", "12345678", "qwerty123"];
    return !commonPasswords.includes(password.toLowerCase());
  }, "Please choose a more secure password");

// Name validation with auto-capitalization
export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name must be less than 50 characters")
  .regex(
    /^[a-zA-Z\s'-]+$/,
    "Name can only contain letters, spaces, hyphens, and apostrophes"
  )
  .transform((name) => {
    return name.replace(/\b\w/g, (char) => char.toUpperCase());
  });
```

### ✅ 2. Composite Form Schemas

Created complete form schemas using composition:

```typescript
export const loginFormSchema = authFormBaseSchema.extend({
  password: loginPasswordSchema,
});

export const signupFormSchema = authFormBaseSchema.extend({
  firstName: nameSchema,
  lastName: nameSchema,
  password: passwordSchema,
});

export const profileFormSchema = z.object({
  firstname: nameSchema,
  lastname: nameSchema,
  email: emailSchema,
});
```

### ✅ 3. Advanced Phone Number Validation

Implemented preprocessing and transformation pipeline:

```typescript
export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((phone) => phone.replace(/\D/g, "")) // Remove non-digits
  .pipe(
    z
      .string()
      .length(10, "Phone number must be exactly 10 digits")
      .regex(/^\d{10}$/, "Phone number must contain only digits")
      .transform(
        (digits) =>
          `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
      )
  );
```

### ✅ 4. File Validation with Zod

Migrated manual file validation to proper Zod schemas:

```typescript
export const imageFileSchema = z
  .instanceof(File)
  .refine((file) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    return allowedTypes.includes(file.type);
  }, "Please select a valid image file (JPEG, PNG, GIF, or WebP)")
  .refine((file) => {
    const maxSize = 5 * 1024 * 1024; // 5MB
    return file.size <= maxSize;
  }, "Image file must be less than 5MB");
```

### ✅ 5. Updated All Forms to Use Shared Schemas

Refactored all forms to import and use centralized schemas:

- **Auth Forms**: `use-login-form.ts`, `use-signup-form.ts`, `reset-password-form.tsx`
- **Profile Form**: `profile-form.tsx`
- **Team Forms**: `create-team-form.tsx`, `manage-edit-team.tsx`, `use-create-team-form.ts`

## Additional Recommendations

### 🔄 Advanced Features to Consider

1. **Conditional Validation**

```typescript
const userSchema = z
  .object({
    role: z.enum(["admin", "user"]),
    permissions: z.array(z.string()).optional(),
  })
  .refine((data) => {
    if (data.role === "admin") {
      return data.permissions && data.permissions.length > 0;
    }
    return true;
  }, "Admin users must have at least one permission");
```

2. **Discriminated Unions for Complex Forms**

```typescript
const formSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("player"),
    teamId: z.string(),
  }),
  z.object({
    type: z.literal("captain"),
    teamName: z.string(),
  }),
]);
```

3. **Custom Error Maps**

```typescript
const customErrorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === z.ZodIssueCode.invalid_type) {
    if (issue.expected === "string") {
      return { message: "This field is required" };
    }
  }
  return { message: ctx.defaultError };
};

z.setErrorMap(customErrorMap);
```

### 🔧 Integration Improvements

1. **Runtime Type Guards**

```typescript
export const isValidEmail = (email: unknown): email is string => {
  return emailSchema.safeParse(email).success;
};
```

2. **API Response Validation**

```typescript
const playerResponseSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  teamId: z.string().optional(),
});

export type PlayerResponse = z.infer<typeof playerResponseSchema>;

// Use in API calls
const validatePlayerResponse = (data: unknown): PlayerResponse => {
  return playerResponseSchema.parse(data);
};
```

3. **Environment Variable Validation**

```typescript
const envSchema = z.object({
  FIREBASE_API_KEY: z.string(),
  FIREBASE_AUTH_DOMAIN: z.string(),
  NODE_ENV: z.enum(["development", "production", "test"]),
});

export const env = envSchema.parse(process.env);
```

## Migration Strategy

1. ✅ **Phase 1**: Update core validation schemas (COMPLETED)
2. ✅ **Phase 2**: Migrate all form components (COMPLETED)
3. 🔄 **Phase 3**: Add API response validation
4. 🔄 **Phase 4**: Implement advanced conditional validation
5. 🔄 **Phase 5**: Add runtime type guards throughout app

## Benefits Achieved

1. **Consistency**: All forms now use the same validation rules
2. **Security**: Stronger password requirements and input sanitization
3. **UX**: Better error messages and automatic data formatting
4. **Maintainability**: Centralized validation logic
5. **Type Safety**: Proper TypeScript integration with `z.infer`
6. **Performance**: Efficient validation with early returns

## Testing Recommendations

1. **Unit Test Schemas**

```typescript
describe("emailSchema", () => {
  it("should normalize email to lowercase", () => {
    const result = emailSchema.parse("TEST@EXAMPLE.COM");
    expect(result).toBe("test@example.com");
  });

  it("should reject invalid emails", () => {
    expect(() => emailSchema.parse("invalid-email")).toThrow();
  });
});
```

2. **Integration Tests**

```typescript
describe("LoginForm", () => {
  it("should validate and transform input correctly", async () => {
    render(<LoginForm onSuccess={() => {}} />);

    await userEvent.type(screen.getByLabelText(/email/i), "TEST@EXAMPLE.COM");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");

    // Verify normalized email is used in submission
    expect(mockSignIn).toHaveBeenCalledWith("test@example.com", "password123");
  });
});
```

The application now follows Zod best practices with robust, reusable validation schemas that provide excellent user experience and developer experience.
