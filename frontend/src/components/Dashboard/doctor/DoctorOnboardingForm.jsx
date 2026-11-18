import { userAuthStore } from "@/store/authStore";
import React, { useState } from "react";
import { Card, CardContent } from "../ui/card";
import { useNavigate } from "react-router-dom";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { specializations } from "@/lib/constant";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

const DoctorOnboardingForm = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    specialization: "",
    qualification: "",
    experience: "",
    fees: "",
    about: "",
    availabilityRange: { startDate: "", endDate: "", excludedWeekdays: [] },
    dailyTimeRanges: [
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "17:00" },
    ],
    slotDurationMinutes: 30,
  });

  const { updateProfile, user, loading } = userAuthStore();
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    try {
      await updateProfile({
        specialization: formData.specialization,
        qualification: formData.qualification,
        experience: Number(formData.experience),
        fees: Number(formData.fees),
        about: formData.about,
        availabilityRange: {
          startDate: formData.availabilityRange.startDate,
          endDate: formData.availabilityRange.endDate,
          excludedWeekdays: formData.availabilityRange.excludedWeekdays,
        },
        dailyTimeRanges: formData.dailyTimeRanges,
        slotDurationMinutes: Number(formData.slotDurationMinutes),
      });
      navigate("/doctor/dashboard");
    } catch (error) {
      console.error("Profile update failed", error);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card className="shadow-lg">
        <CardContent className="p-8">
          {currentStep === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold mb-4">Professional Information</h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="specialization">Medical Specialization</Label>
                  <Select
                    value={formData.specialization}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, specialization: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select specialization" />
                    </SelectTrigger>
                    <SelectContent>
                      {specializations.map((spec) => (
                        <SelectItem key={spec} value={spec}>
                          {spec}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experience">Years of Experience</Label>
                  <Input
                    id="experience"
                    name="experience"
                    type="number"
                    value={formData.experience}
                    placeholder="e.g., 5"
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>



              <div className="space-y-2">
                <Label htmlFor="qualification">Qualification</Label>
                <Input
                  id="qualification"
                  name="qualification"
                  type="text"
                  value={formData.qualification}
                  placeholder="e.g., MBBS, MD Cardiology"
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="about">About You</Label>
                <Input
                  id="about"
                  name="about"
                  type="text"
                  value={formData.about}
                  placeholder="Tell patients about your expertise and approach to care..."
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fees">Consultation Fee (₹)</Label>
                <Input
                  id="fees"
                  name="fees"
                  type="number"
                  value={formData.fees}
                  placeholder="e.g., 500"
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold mb-4">Availability Settings</h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Available From</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.availabilityRange.startDate}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        availabilityRange: { ...prev.availabilityRange, startDate: e.target.value },
                      }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">Available Until</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.availabilityRange.endDate}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        availabilityRange: { ...prev.availabilityRange, endDate: e.target.value },
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Appointment Slot Duration</Label>
                <Select
                  value={String(formData.slotDurationMinutes || 30)}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, slotDurationMinutes: Number(value) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select slot duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {["15", "20", "30", "45", "60", "90", "120"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-600">Duration for each patient consultation slot</p>
              </div>

              <div className="space-y-3">
                <Label>Working Days</Label>
                <p className="text-sm text-gray-600">Select the days you are NOT available</p>

                <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                  {[
                    { day: "Sun", value: 0 },
                    { day: "Mon", value: 1 },
                    { day: "Tue", value: 2 },
                    { day: "Wed", value: 3 },
                    { day: "Thu", value: 4 },
                    { day: "Fri", value: 5 },
                    { day: "Sat", value: 6 },
                  ].map(({ day, value }) => {
                    const checked = formData.availabilityRange.excludedWeekdays.includes(value);
                    return (
                      <div key={value} className="flex items-center gap-2">
                        <Checkbox
                          id={`day-${value}`}
                          checked={checked}
                          onCheckedChange={(isChecked) => {
                            setFormData((prev) => ({
                              ...prev,
                              availabilityRange: {
                                ...prev.availabilityRange,
                                excludedWeekdays: isChecked
                                  ? [...prev.availabilityRange.excludedWeekdays, value]
                                  : prev.availabilityRange.excludedWeekdays.filter((d) => d !== value),
                              },
                            }));
                          }}
                        />
                        <label htmlFor={`day-${value}`} className="text-sm font-medium cursor-pointer">
                          {day}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <Label>Daily Working Hours</Label>
                <p className="text-sm text-gray-600">Set your working hours for each day</p>

                {formData.dailyTimeRanges.map((range, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="flex-1">
                      <Label className="text-sm">Session {index + 1} - Start time</Label>
                      <Input
                        type="time"
                        value={range.start}
                        onChange={(e) => {
                          const arr = [...formData.dailyTimeRanges];
                          arr[index].start = e.target.value;
                          setFormData((prev) => ({ ...prev, dailyTimeRanges: arr }));
                        }}
                        required
                      />
                    </div>

                    <div className="flex-1">
                      <Label className="text-sm">Session {index + 1} - End time</Label>
                      <Input
                        type="time"
                        value={range.end}
                        onChange={(e) => {
                          const arr = [...formData.dailyTimeRanges];
                          arr[index].end = e.target.value;
                          setFormData((prev) => ({ ...prev, dailyTimeRanges: arr }));
                        }}
                        required
                      />
                    </div>

                    {formData.dailyTimeRanges.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const arr = formData.dailyTimeRanges.filter((_, i) => i !== index);
                          setFormData((prev) => ({ ...prev, dailyTimeRanges: arr }));
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      dailyTimeRanges: [...prev.dailyTimeRanges, { start: "18:00", end: "20:00" }],
                    }))
                  }
                  className="w-full"
                >
                  + Add Another Time Session
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
              disabled={currentStep === 1}
            >
              Previous
            </Button>

            {currentStep < 2 ? (
              <Button
                type="button"
                onClick={() => setCurrentStep((s) => Math.min(2, s + 1))}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? "Completing Setup..." : "Complete Profile"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DoctorOnboardingForm;
