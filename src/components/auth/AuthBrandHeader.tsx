
import React from "react";
import { View, Image, StyleSheet } from "react-native";

export default function AuthBrandHeader() {
  return (
    <View style={styles.wrap}>
      <Image
        source={require("../../../assets/images/auth/brand/flightclub-header.png")}
        style={styles.logo}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginTop: 18,
    marginBottom: 30,
  },
  logo: {
    width: 310,
    height: 70,
    marginLeft: -30,
  },
});

