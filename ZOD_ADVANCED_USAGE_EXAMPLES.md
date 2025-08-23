# Advanced Zod Usage Examples

This document demonstrates how to use the enhanced Zod validation schemas and best practices in your React components.

## 1. Using the Custom Error Map

Set up the custom error map in your app initialization:

```typescript
// src/main.tsx or src/App.tsx
import { setCustomErrorMap } from "@/shared/utils/validation";

// Set custom error map for better UX
setCustomErrorMap();

function App() {
  // Your app component
}
```

## 2. API Response Validation

Validate Firebase/API responses with runtime type safety:

```typescript
// src/hooks/usePlayerData.ts
import {
  validatePlayerData,
  safeParsePlayerData,
} from "@/shared/utils/validation";

export const usePlayerData = (playerId: string) => {
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPlayer = async () => {
      try {
        const response = await getDoc(playerRef);
        const rawData = response.data();

        // Validate and transform the data
        const validatedPlayer = validatePlayerData(rawData);
        setPlayer(validatedPlayer);
      } catch (err) {
        if (err instanceof z.ZodError) {
          setError("Invalid player data received from server");
          console.error("Player validation failed:", err.errors);
        } else {
          setError("Failed to fetch player data");
        }
      }
    };

    fetchPlayer();
  }, [playerId]);

  return { player, error };
};
```

## 3. Advanced Form Validation with Conditional Logic

```typescript
// src/components/TeamRegistrationForm.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  teamRegistrationSchema,
  createFormValidator,
} from "@/shared/utils/validation";

export const TeamRegistrationForm = () => {
  const validator = createFormValidator(teamRegistrationSchema);

  const form = useForm({
    resolver: zodResolver(teamRegistrationSchema),
    defaultValues: {
      teamName: "",
      captainName: "",
      captainEmail: "",
      logoFile: undefined,
      agreesToTerms: false,
      hasMinimumPlayers: false,
      playerCount: 0,
    },
  });

  const onSubmit = async (data) => {
    try {
      // Additional validation with custom validator
      const validatedData = validator.validate(data);

      // Submit the form
      await submitTeamRegistration(validatedData);
      toast.success("Team registered successfully!");
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>{/* Form fields */}</form>
    </Form>
  );
};
```

## 4. Search with Validation and Transformation

```typescript
// src/components/PlayerSearch.tsx
import { searchQuerySchema, paginationSchema } from "@/shared/utils/validation";

export const PlayerSearch = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const handleSearch = (query: string) => {
    try {
      // Validate and transform search query
      const validatedQuery = searchQuerySchema.parse(query);
      setSearchParams({ q: validatedQuery, page: "1" });
    } catch (error) {
      toast.error("Invalid search query");
    }
  };

  const pagination = useMemo(() => {
    const page = searchParams.get("page");
    const limit = searchParams.get("limit");

    return paginationSchema.parse({ page, limit });
  }, [searchParams]);

  return (
    <div>
      <input
        type="text"
        placeholder="Search players..."
        onChange={(e) => handleSearch(e.target.value)}
      />
      <PlayerList pagination={pagination} />
    </div>
  );
};
```

## 5. Environment Validation

```typescript
// src/config/env.ts
import { environmentSchema } from "@/shared/utils/validation";

// Validate environment variables at startup
export const env = environmentSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
});
```

## 6. Payment Processing with Validation

```typescript
// src/components/PaymentForm.tsx
import {
  paymentDataSchema,
  createFormValidator,
} from "@/shared/utils/validation";

export const PaymentForm = () => {
  const paymentValidator = createFormValidator(paymentDataSchema);

  const handlePayment = async (formData) => {
    try {
      // Validate payment data
      const paymentData = paymentValidator.validate(formData);

      // Process payment with validated data
      const result = await processPayment(paymentData);

      if (result.success) {
        toast.success("Payment processed successfully!");
      }
    } catch (error) {
      // Get specific field errors for better UX
      const fieldErrors = paymentValidator.getFieldErrors(formData);

      if (Object.keys(fieldErrors).length > 0) {
        // Display field-specific errors
        Object.entries(fieldErrors).forEach(([field, message]) => {
          form.setError(field, { message });
        });
      } else {
        toast.error("Payment processing failed");
      }
    }
  };

  return <Form>{/* Payment form fields */}</Form>;
};
```

## 7. Real-time Validation with Debouncing

```typescript
// src/hooks/useValidatedInput.ts
import { useMemo } from "react";
import { useDebounce } from "use-debounce";
import { z } from "zod";

export const useValidatedInput = <T extends z.ZodTypeAny>(
  value: string,
  schema: T,
  delay = 300
) => {
  const [debouncedValue] = useDebounce(value, delay);

  const validation = useMemo(() => {
    if (!debouncedValue) {
      return { isValid: true, error: null, data: null };
    }

    const result = schema.safeParse(debouncedValue);

    return {
      isValid: result.success,
      error: result.success ? null : result.error.errors[0]?.message,
      data: result.success ? result.data : null,
    };
  }, [debouncedValue, schema]);

  return validation;
};

// Usage in component
export const TeamNameInput = () => {
  const [teamName, setTeamName] = useState("");
  const validation = useValidatedInput(teamName, teamNameSchema);

  return (
    <div>
      <input
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        className={validation.isValid ? "valid" : "invalid"}
      />
      {validation.error && <span className="error">{validation.error}</span>}
    </div>
  );
};
```

## 8. Type-Safe API Utilities

```typescript
// src/api/playerApi.ts
import { playerDataSchema } from "@/shared/utils/validation";

export const playerApi = {
  async getPlayer(id: string) {
    const response = await fetch(`/api/players/${id}`);
    const rawData = await response.json();

    // Runtime validation ensures type safety
    return playerDataSchema.parse(rawData);
  },

  async updatePlayer(
    id: string,
    updates: Partial<z.infer<typeof playerDataSchema>>
  ) {
    // Validate partial updates
    const validatedUpdates = playerDataSchema.partial().parse(updates);

    const response = await fetch(`/api/players/${id}`, {
      method: "PATCH",
      body: JSON.stringify(validatedUpdates),
    });

    return response.ok;
  },
};
```

## Best Practices Summary

1. **Always validate external data** - API responses, URL parameters, localStorage
2. **Use transform() for data normalization** - emails to lowercase, names to proper case
3. **Implement conditional validation with refine()** - business logic validation
4. **Create reusable validators** - with createFormValidator utility
5. **Set custom error maps** - for better user experience
6. **Validate environment variables** - catch configuration errors early
7. **Use safeParse() for error handling** - instead of parse() when errors are expected
8. **Combine schemas with composition** - extend(), merge(), pick() for DRY code
