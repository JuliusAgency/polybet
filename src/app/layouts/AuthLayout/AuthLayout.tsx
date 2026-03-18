import type { ReactNode } from 'react';

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-950"
    >
      <div className="w-full max-w-md px-4">
        {children}
      </div>
    </div>
  );
};
