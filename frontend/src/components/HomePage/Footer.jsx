//frontend/src/components/HomePage/Footer.jsx
import React from "react";

function Footer() {
  return (
    <footer className="container-fluid footer-1 mt-auto border-t border-slate-200 py-6 sticky top-[100vh]">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 text-center">
          <div className="lg:flex-[3] text-center lg:text-left">
            <div className="copy-ryt">
              <p className="text-sm font-['roboto-light'] font-light text-slate-600 lg:whitespace-nowrap">
                © 2019-2026. Brains Super Speciality Hospital. All rights reserved.
              </p>
            </div>
          </div>
          <div className="lg:flex-[2] flex justify-center items-center gap-2 text-sm font-['roboto-light'] font-light text-slate-600">
            <a
              href="https://brainshospital.com/Privacy-Policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-accent transition-colors duration-200"
            >
              Privacy Policy
            </a>
            <span className="text-slate-500">|</span>
            <a
              href="https://brainshospital.com/Disclaimer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-accent transition-colors duration-200"
            >
              Disclaimer
            </a>
          </div>
          <div className="lg:flex-[3] text-center lg:text-right">
            <div className="design">
              <p className="text-sm font-['roboto-light'] font-light text-slate-600 lg:whitespace-nowrap">
                Powered By:{" "}
                <a href="https://lumos.in/" target="_blank" rel="noopener noreferrer">
                  LUMOS.in
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
