# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Security Architecture

This application implements a **Functions-First Security Model** for maximum protection:

### Firebase Functions (Server-Side Logic)

- **All write operations** (create, update, delete) go through Firebase Functions
- **Server-side validation** ensures data integrity and business rule enforcement
- **Authenticated and authorized** operations only
- **Centralized security** logic prevents client-side tampering

### Firestore Security Rules

- **Public read access** for league information (games, teams, standings, seasons)
- **Restricted read access** for sensitive data (offers limited to involved parties)
- **All writes denied** at client level - forces use of secure Functions
- **Helper functions** for maintainable and readable rules

### Firebase Storage Security

- **Public read access** for uploaded images
- **All uploads through Functions** using signed URLs
- **File validation**: Only images, 5MB limit, authenticated users with verified emails
- **No client-side uploads** - prevents malicious file uploads

### Authentication Requirements

- **Email verification required** for all write operations
- **User authentication required** for all sensitive operations
- **Role-based permissions** (captains, admins) enforced server-side

### Data Protection

- **Input validation** on all Function parameters
- **SQL injection prevention** through Firestore's NoSQL structure
- **XSS prevention** through proper data sanitization
- **File upload restrictions** prevent executable uploads

## Migration Status

✅ **Firestore Security**: Complete (Functions-first architecture)  
✅ **Storage Security**: Complete (Functions-first architecture)  
🔄 **Authentication**: Enhanced with email verification requirements  
⏳ **Additional Features**: Function deployments pending TypeScript fixes

## Reporting a Vulnerability

To report a vulnerability, create an **Issue** on GitHub.

You can expect to get an update within a week of a reported vulnerability.

## Security Best Practices Implemented

1. **Principle of Least Privilege**: Users can only access what they need
2. **Defense in Depth**: Multiple layers of validation (client, rules, functions)
3. **Server-Side Validation**: All business logic handled securely on the server
4. **Audit Trail**: All operations logged through Firebase Functions
5. **Input Sanitization**: All user inputs validated and sanitized
6. **Secure File Uploads**: Signed URLs with strict validation
