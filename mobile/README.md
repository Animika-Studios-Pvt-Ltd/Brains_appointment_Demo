# Brains Appointment - Patient Mobile Application

Expo-based React Native mobile application for **Patient** users of the Brains Appointment system.

## Features

- **Authentication**: Patient Login & Account Registration with token caching via `@react-native-async-storage/async-storage`.
- **Dashboard Home**: Greeting header, quick appointment stats, upcoming appointment highlights, and one-tap booking action.
- **Appointments Management**: View Upcoming, Completed, and Cancelled appointments with detailed doctor & time info, status badges, and appointment cancellation.
- **Book Appointment**: Select doctor, pick slot date & time, add visit reason, and submit appointment directly to backend API.
- **Medical Records**: View prescriptions, doctor notes, diagnosis history, and lab reports.
- **Patient Profile**: View and edit patient personal details (name, phone, address) and logout.

## Backend Integration

The app connects to the Brains Appointment Express Backend via API client:
- Auth: `/api/auth/login`, `/api/auth/register`, `/api/auth/me`
- Patient: `/api/patient/appointments`, `/api/patient/doctors`, `/api/patient/medical-records`, `/api/patient/profile`
- Appointments: `/api/appointment/book`, `/api/appointment/:id/cancel`

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the Expo dev server:
   ```bash
   npx expo start
   ```
