/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.fractal.jantt;

import android.content.Context;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private FrameLayout mErrorRootView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        try {
            super.onCreate(savedInstanceState);
        } catch (IllegalStateException e) {
            // Samsung Android 8/9 throws on translucent activities
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            }
        } catch (IllegalStateException e) {
            // Ignore on older OEM ROMs
        }

        if (!isOnline()) {
            showErrorView();
        }
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        return isOnline();
    }

    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network activeNetwork = cm.getActiveNetwork();
                if (activeNetwork == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
                return caps != null && (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        || caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
            } else {
                NetworkInfo netInfo = cm.getActiveNetworkInfo();
                return netInfo != null && netInfo.isConnected();
            }
        } catch (Exception e) {
            return true;
        }
    }

    private void showErrorView() {
        if (mErrorRootView != null) return;

        mErrorRootView = new FrameLayout(this);
        mErrorRootView.setBackgroundColor(0xFF000000); // Pure Jantt Black

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        int pad = dpToPx(32);
        layout.setPadding(pad, pad, pad, pad);

        FrameLayout.LayoutParams layoutParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
        );
        mErrorRootView.addView(layout, layoutParams);

        // App Icon
        ImageView iconView = new ImageView(this);
        iconView.setImageResource(R.mipmap.ic_launcher);
        int iconSize = dpToPx(72);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(iconSize, iconSize);
        iconParams.bottomMargin = dpToPx(20);
        layout.addView(iconView, iconParams);

        // Title
        TextView titleView = new TextView(this);
        titleView.setText("Connection Unreachable");
        titleView.setTextColor(0xFFF8FAFC);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        titleView.setGravity(Gravity.CENTER);
        titleView.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.bottomMargin = dpToPx(8);
        layout.addView(titleView, titleParams);

        // Description
        TextView descView = new TextView(this);
        descView.setText("Unable to reach Jantt workspace.\nPlease check your internet connection.");
        descView.setTextColor(0xFF94A3B8);
        descView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        descView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams descParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        descParams.bottomMargin = dpToPx(28);
        layout.addView(descView, descParams);

        // Retry Button
        Button retryButton = new Button(this);
        retryButton.setText("Retry Connection");
        retryButton.setTextColor(0xFFFFFFFF);
        retryButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        retryButton.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);

        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(0xFF1E293B);
        btnBg.setCornerRadius(dpToPx(8));
        btnBg.setStroke(dpToPx(1), 0xFF334155);
        retryButton.setBackground(btnBg);
        retryButton.setPadding(dpToPx(24), dpToPx(12), dpToPx(24), dpToPx(12));

        retryButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (isOnline()) {
                    if (mErrorRootView != null) {
                        ViewGroup parent = (ViewGroup) mErrorRootView.getParent();
                        if (parent != null) {
                            parent.removeView(mErrorRootView);
                        }
                        mErrorRootView = null;
                    }
                    launchTwa();
                } else {
                    Toast.makeText(LauncherActivity.this, "Still offline. Please check your network.", Toast.LENGTH_SHORT).show();
                }
            }
        });

        layout.addView(retryButton);

        setContentView(mErrorRootView);
    }

    private int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                dp,
                getResources().getDisplayMetrics()
        );
    }

    @Override
    protected Uri getLaunchingUrl() {
        return super.getLaunchingUrl();
    }
}
