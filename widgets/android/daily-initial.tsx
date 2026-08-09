import { VoltraAndroid } from "@use-voltra/android";

/** Placeholder for the Android `daily` widget before first sync. */
export default [
  {
    size: { width: 110, height: 110 },
    content: (
      <VoltraAndroid.Column
        style={{ width: "100%", height: "100%", padding: 14, backgroundColor: "#F3E9DC" }}
        verticalAlignment="center-vertically"
      >
        <VoltraAndroid.Text style={{ color: "#3B2E25", fontSize: 14 }}>
          Open Future Self to receive today's words.
        </VoltraAndroid.Text>
      </VoltraAndroid.Column>
    ),
  },
];
