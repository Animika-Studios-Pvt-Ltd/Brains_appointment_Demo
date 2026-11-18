import React from "react";
import { performLogout } from "../../utils/api";

const LogoutButton = () => {
  return (
    <button
      type="button"
      onClick={() => {
        performLogout();
      }}
      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition"
    >
      Logout
    </button>
  );
};

export default LogoutButton;
