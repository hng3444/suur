package com.hng3444.suur;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SuurSecureSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
