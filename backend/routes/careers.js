const express = require('express');
const router = express.Router();
const CareerApplication = require('../modal/CareerApplication');
const gmailService = require('../services/gmailService');

// POST /api/careers/apply
router.post('/apply', async (req, res) => {
  try {
    const { fullName, email, phone, experience, position, message } = req.body;

    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email format.' });
    }
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    if (!position || typeof position !== 'string' || !position.trim()) {
      return res.status(400).json({ success: false, message: 'Position applied for is required.' });
    }

    const cleanFullName = fullName.trim();
    const cleanPhone = phone.trim();
    const cleanExperience = (experience || 'Not Specified').trim();
    const cleanPosition = position.trim();
    const cleanMessage = (message || '').trim();

    // 1. Save application record in database
    let savedApplication = null;
    try {
      savedApplication = await CareerApplication.create({
        fullName: cleanFullName,
        email: cleanEmail,
        phone: cleanPhone,
        experience: cleanExperience,
        position: cleanPosition,
        message: cleanMessage,
        status: 'received'
      });
    } catch (dbErr) {
      console.warn('Warning: Could not save career application to database:', dbErr.message);
    }

    // 2. Email confirmation to Candidate (User)
    const candidateSubject = "Application Received: " + cleanPosition + " - Brains Super Speciality Hospital";
    const candidateHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f8fa; margin: 0; padding: 20px; color: #333333; }
    .card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0a3d6b 0%, #1678b4 50%, #4cebd1 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0 0 8px 0; font-size: 24px; font-weight: 700; }
    .header p { margin: 0; font-size: 14px; opacity: 0.95; }
    .body { padding: 30px 28px; line-height: 1.6; }
    .welcome-text { font-size: 16px; margin-bottom: 16px; color: #222222; }
    .status-badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px; margin-bottom: 20px; }
    .details-box { background: #f8fafc; border-left: 4px solid #1678b4; padding: 16px 20px; border-radius: 6px; margin: 20px 0; }
    .details-box h3 { margin: 0 0 12px 0; font-size: 15px; color: #0a3d6b; }
    .details-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .details-table td { padding: 6px 0; vertical-align: top; }
    .details-table td.label { width: 140px; color: #64748b; font-weight: 600; }
    .details-table td.val { color: #1e293b; }
    .next-steps { background: #ecfdf5; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #065f46; }
    .footer { background: #f8fafc; border-top: 1px solid #eef2f5; padding: 20px; text-align: center; font-size: 12px; color: #777777; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Brains Super Speciality Hospital</h1>
      <p>Careers & Talent Acquisition Team</p>
    </div>
    <div class="body">
      <p class="welcome-text">Dear <strong>${cleanFullName}</strong>,</p>
      <span class="status-badge">Application Status: Successfully Received</span>
      <p>Thank you for your interest in joining <strong>Brains Super Speciality Hospital</strong>. We have successfully received your application for the position of <strong>${cleanPosition}</strong>.</p>
      
      <div class="details-box">
        <h3>Summary of Your Application</h3>
        <table class="details-table">
          <tr><td class="label">Candidate Name:</td><td class="val">${cleanFullName}</td></tr>
          <tr><td class="label">Position:</td><td class="val">${cleanPosition}</td></tr>
          <tr><td class="label">Experience:</td><td class="val">${cleanExperience}</td></tr>
          <tr><td class="label">Contact Phone:</td><td class="val">${cleanPhone}</td></tr>
          <tr><td class="label">Contact Email:</td><td class="val">${cleanEmail}</td></tr>
          ${cleanMessage ? "<tr><td class='label'>Cover Note:</td><td class='val'>" + cleanMessage.replace(/\n/g, '<br/>') + "</td></tr>" : ""}
        </table>
      </div>

      <div class="next-steps">
        <strong>What's Next?</strong><br/>
        Our HR & Medical Recruitment Team will carefully review your credentials. If your profile matches our requirements, we will reach out to you via phone or email for the next steps.
      </div>

      <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
        If you have any queries regarding your application, feel free to contact our helpline at <strong>+91 91480 80000</strong>.
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px 0;"><strong>Brains Super Speciality Hospital</strong></p>
      <p style="margin: 0 0 6px 0;">192, T Mariyappa Road, Lalbagh, Siddapura, Jayanagar 1st Block, Bengaluru - 560011</p>
      <p style="margin: 0;">This is an automated confirmation of your application submission.</p>
    </div>
  </div>
</body>
</html>
`;

    // 3. Email notification to Brains Hospital / HR Admin
    const hospitalAdminEmail = (process.env.CAREERS_RECIPIENT_EMAIL || process.env.SMTP_USER || 'callcenter@brains.org.in').trim();
    const hospitalSubject = "New Job Application: " + cleanPosition + " - " + cleanFullName;
    const formattedDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const hospitalHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f8fa; margin: 0; padding: 20px; color: #333333; }
    .card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0a3d6b 0%, #1678b4 100%); padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 700; }
    .header p { margin: 0; font-size: 14px; opacity: 0.92; }
    .body { padding: 26px 24px; line-height: 1.6; }
    .details-table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    .details-table td { padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 14px; }
    .details-table td.label { width: 160px; background: #f8fafc; font-weight: 600; color: #334155; }
    .details-table td.val { color: #0f172a; }
    .msg-box { background: #f1f5f9; padding: 14px; border-radius: 6px; margin-top: 14px; font-size: 13px; line-height: 1.5; color: #1e293b; }
    .footer { background: #f8fafc; border-top: 1px solid #eef2f5; padding: 16px; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>New Career Application Received</h1>
      <p>Brains Super Speciality Hospital - Recruitment Portal</p>
    </div>
    <div class="body">
      <p>A candidate has submitted a job application on the <strong>Brains Hospital Careers Page</strong>:</p>

      <table class="details-table">
        <tr><td class="label">Position Applied:</td><td class="val"><strong style="color: #0a3d6b;">${cleanPosition}</strong></td></tr>
        <tr><td class="label">Candidate Name:</td><td class="val">${cleanFullName}</td></tr>
        <tr><td class="label">Email Address:</td><td class="val"><a href="mailto:${cleanEmail}">${cleanEmail}</a></td></tr>
        <tr><td class="label">Phone Number:</td><td class="val"><a href="tel:${cleanPhone}">${cleanPhone}</a></td></tr>
        <tr><td class="label">Experience:</td><td class="val">${cleanExperience}</td></tr>
        <tr><td class="label">Received On:</td><td class="val">${formattedDate} IST</td></tr>
      </table>

      ${cleanMessage ? "<h4 style='margin: 20px 0 6px 0; color: #0a3d6b; font-size: 14px;'>Cover Letter / Candidate Note:</h4><div class='msg-box'>" + cleanMessage.replace(/\n/g, '<br/>') + "</div>" : ""}

      <div style="margin-top: 24px; text-align: center;">
        <a href="mailto:${cleanEmail}?subject=Regarding%20your%20application%20for%20${encodeURIComponent(cleanPosition)}%20at%20Brains%20Hospital" style="background: #1678b4; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-weight: 600; font-size: 13px; display: inline-block;">Reply to Candidate</a>
      </div>
    </div>
    <div class="footer">
      Brains Super Speciality Hospital - Automated Recruitment Alert
    </div>
  </div>
</body>
</html>
`;

    // 4. Dispatch emails via gmailService
    let emailStatus = { candidateSent: false, hospitalSent: false };

    try {
      await gmailService.sendMail(cleanEmail, candidateSubject, candidateHtml);
      emailStatus.candidateSent = true;
    } catch (candMailErr) {
      console.warn('Could not send confirmation email to candidate:', candMailErr.message);
    }

    try {
      if (hospitalAdminEmail) {
        await gmailService.sendMail(hospitalAdminEmail, hospitalSubject, hospitalHtml);
        emailStatus.hospitalSent = true;
      }
    } catch (hospMailErr) {
      console.warn('Could not send application notification to hospital email:', hospMailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Your application has been submitted successfully! A confirmation email has been sent to your inbox.',
      data: {
        applicationId: savedApplication ? savedApplication._id : null,
        emailStatus
      }
    });

  } catch (error) {
    console.error('Career application submission error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit application. Please try again later.'
    });
  }
});

module.exports = router;
