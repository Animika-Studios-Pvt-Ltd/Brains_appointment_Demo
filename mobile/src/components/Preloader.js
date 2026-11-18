import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  Text,
  Easing,
  Platform,
} from 'react-native';
import Svg, {
  Path,
  G,
  Polygon,
  Rect,
  Defs,
  ClipPath,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedView = Animated.createAnimatedComponent(View);

export const Preloader = ({ onComplete }) => {
  const isMounted = useRef(true);

  // Preloader container animations (Exit Transition)
  const preloaderOpacity = useRef(new Animated.Value(1)).current;
  const preloaderY = useRef(new Animated.Value(0)).current;

  // Circular Shield Component Animations
  const shieldPart1Opacity = useRef(new Animated.Value(0)).current;
  const shieldPart1X = useRef(new Animated.Value(-30)).current;
  const shieldPart1Y = useRef(new Animated.Value(0)).current;

  const shieldPart2Opacity = useRef(new Animated.Value(0)).current;
  const shieldPart2X = useRef(new Animated.Value(-20)).current;
  const shieldPart2Y = useRef(new Animated.Value(-20)).current;

  const shieldPart3Opacity = useRef(new Animated.Value(0)).current;
  const shieldPart3X = useRef(new Animated.Value(20)).current;
  const shieldPart3Y = useRef(new Animated.Value(-20)).current;

  const shieldPart4Opacity = useRef(new Animated.Value(0)).current;
  const shieldPart4X = useRef(new Animated.Value(30)).current;
  const shieldPart4Y = useRef(new Animated.Value(10)).current;

  const shieldPart5Opacity = useRef(new Animated.Value(0)).current;
  const shieldPart5X = useRef(new Animated.Value(-20)).current;
  const shieldPart5Y = useRef(new Animated.Value(20)).current;

  // Individual letter animations for "B R A I N S"
  const bY = useRef(new Animated.Value(15)).current;
  const bOpacity = useRef(new Animated.Value(0)).current;

  const rY = useRef(new Animated.Value(15)).current;
  const rOpacity = useRef(new Animated.Value(0)).current;

  const aY = useRef(new Animated.Value(15)).current;
  const aOpacity = useRef(new Animated.Value(0)).current;

  const iY = useRef(new Animated.Value(15)).current;
  const iOpacity = useRef(new Animated.Value(0)).current;

  const nY = useRef(new Animated.Value(15)).current;
  const nOpacity = useRef(new Animated.Value(0)).current;

  const sY = useRef(new Animated.Value(15)).current;
  const sOpacity = useRef(new Animated.Value(0)).current;



  useEffect(() => {
    isMounted.current = true;

    // Hide native splash screen as soon as Preloader mounts to prevent blank flash frames
    SplashScreen.hideAsync().catch(() => { });

    // Logo entrance animation sequence (Circular shield parts, then letters)
    const logoEntranceAnimations = [
      // 1. Reveal shield parts in a circle (Inner curves and sweeps first, dark base shield outline last)
      Animated.stagger(150, [
        Animated.parallel([
          Animated.timing(shieldPart2Opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(shieldPart2X, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
          Animated.timing(shieldPart2Y, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(shieldPart3Opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(shieldPart3X, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
          Animated.timing(shieldPart3Y, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(shieldPart4Opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(shieldPart4X, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
          Animated.timing(shieldPart4Y, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(shieldPart5Opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(shieldPart5X, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
          Animated.timing(shieldPart5Y, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(shieldPart1Opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(shieldPart1X, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
          Animated.timing(shieldPart1Y, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.0)), useNativeDriver: true }),
        ]),
      ]),

      // 2. Animate letters sequentially
      Animated.stagger(120, [
        Animated.parallel([
          Animated.timing(bY, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(bOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(rY, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(rOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(aY, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(aOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(iY, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(iOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(nY, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(nOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(sY, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(sOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      ]),


    ];

    // Start logo entrance animations
    Animated.sequence(logoEntranceAnimations).start();

    // Trigger exit transition and finish loading after 5.4 seconds
    const exitTimeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(preloaderOpacity, {
          toValue: 0,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(preloaderY, {
          toValue: -40,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (onComplete) {
          onComplete();
        }
      });
    }, 5400);

    return () => {
      isMounted.current = false;
      clearTimeout(exitTimeout);
    };
  }, []);

  return (
    <AnimatedView
      style={[
        styles.container,
        {
          opacity: preloaderOpacity,
          transform: [{ translateY: preloaderY }],
        },
      ]}
    >
      {/* Center Logo Group */}
      <View style={styles.logoWrapper}>
        <Svg
          version="1.1"
          id="Layer_1"
          x="0px"
          y="0px"
          viewBox="0 0 280 238"
          style={styles.svgLogo}
        >
          <Defs>
            {/* Gradients */}
            <LinearGradient id="SVGID_3_" gradientUnits="userSpaceOnUse" x1="133.2121" y1="42.104" x2="116.8321" y2="82.914">
              <Stop offset="0" stopColor="#79CAD8" />
              <Stop offset="0.34" stopColor="#11B6CB" />
              <Stop offset="1" stopColor="#008BA5" />
            </LinearGradient>

            <LinearGradient id="SVGID_6_" gradientUnits="userSpaceOnUse" x1="177.2073" y1="88.6804" x2="149.2073" y2="29.2504">
              <Stop offset="0" stopColor="#79CAD8" />
              <Stop offset="0.19" stopColor="#11B6CB" />
              <Stop offset="1" stopColor="#008BA5" />
            </LinearGradient>

            <LinearGradient id="SVGID_9_" gradientUnits="userSpaceOnUse" x1="96.8266" y1="62.6488" x2="160.5866" y2="112.8288">
              <Stop offset="0" stopColor="#79CAD8" />
              <Stop offset="0.49" stopColor="#11B6CB" />
              <Stop offset="1" stopColor="#008BA5" />
            </LinearGradient>

            {/* ClipPaths */}
            <ClipPath id="SVGID_2_">
              <Path d="M118.7,24.2c-9.9,15.9-19.8,41.1-26.3,72c-0.1,0.7-0.2,1.3-0.1,1.9c0.4,1.3,1.8,0.3,2.8-0.5c8.4-6.8,16.3-12.7,23.8-17.9c8.4-27.3,16.1-46.7,20-51.5c9.5-11.6,19.8-6.2,25.8,1.8c-7-13.2-15.8-21.6-25-21.6C132.8,8.4,125.5,13.2,118.7,24.2z" />
            </ClipPath>

            <ClipPath id="SVGID_5_">
              <Path d="M140,27c0.4,0.4,0.7,0.8,1.1,1.2c3.9,4.7,11.8,24.4,19.9,51.4c7.6,5.2,15.5,11.1,23.9,18c1,0.8,2.4,1.8,2.8,0.5c0-0.5,0-1.1-0.1-1.9c-5.8-27.4-14.2-50.3-22.9-66.2c0,0,0,0,0,0c-3.5-4.7-8.4-8.5-13.9-8.5C147.3,21.5,143.6,23.1,140,27z" />
            </ClipPath>

            <ClipPath id="SVGID_8_">
              <Path d="M68.1,53.3c-13.3,7.9-11.8,30.2-10,37.3c-0.3-6.8,1.5-26.1,23.2-22.9c29.2,4.3,63.2,23.1,88.8,45.5c1.2,1.1,2.5,1.6,4.9-0.1c4.1-3,9.2-7.4,11.4-10.7c0.8-1.2,1.3-2.3,1.3-4.2c-0.4,1.3-1.8,0.3-2.8-0.5C139.9,61,106.8,49.1,86,49.1C78.4,49.1,72.4,50.7,68.1,53.3z" />
            </ClipPath>
          </Defs>

          {/* Shield Elements Animating Sequentially in a Circle */}
          <G origin="140, 75">
            {/* Part 1: Dark Blue Base Shield structure (left slide-in) */}
            <AnimatedG
              style={{
                opacity: shieldPart1Opacity,
                transform: [
                  { translateX: shieldPart1X },
                  { translateY: shieldPart1Y },
                ],
              }}
            >
              <Path
                fill="#134E95"
                d="M210.1,68.3c-8,42.2-45.2,63.6-70.2,63.6c-25,0-62.1-21.4-70.1-63.6c0,0,0,0-0.1,0c-0.6,0.2-1.1,0.4-1.6,0.7c-0.1,0.1-0.3,0.1-0.4,0.2c-0.4,0.2-0.8,0.5-1.2,0.7c-0.1,0.1-0.2,0.1-0.3,0.2c-0.4,0.3-0.8,0.6-1.2,0.9c-0.1,0.1-0.3,0.2-0.4,0.4c-0.3,0.2-0.5,0.5-0.8,0.8c-0.1,0.2-0.3,0.3-0.4,0.4c-0.3,0.3-0.5,0.6-0.8,0.9c-0.1,0.2-0.3,0.4-0.4,0.6c-0.2,0.2-0.3,0.4-0.4,0.6c-0.2,0.4-0.5,0.8-0.7,1.2c-0.1,0.2-0.2,0.3-0.3,0.5c-0.1,0.3-0.3,0.6-0.4,0.8c0,0.1-0.1,0.2-0.1,0.3c-2.1,4.8-2.3,10-2.2,13c4.3,24.5,36.1,62.3,81.9,62.3v0v0c45.9,0,77.6-37.9,81.9-62.4C222.1,85.1,221,72.2,210.1,68.3"
              />
            </AnimatedG>

            {/* Part 2: Left gradient curve (top-left slide-in) */}
            <AnimatedG
              style={{
                opacity: shieldPart2Opacity,
                transform: [
                  { translateX: shieldPart2X },
                  { translateY: shieldPart2Y },
                ],
              }}
            >
              <G clipPath="url(#SVGID_2_)">
                <Rect x="92.2" y="8.4" width="72.5" height="90.9" fill="url(#SVGID_3_)" />
              </G>
            </AnimatedG>

            {/* Part 3: Right gradient curve (top-right slide-in) */}
            <AnimatedG
              style={{
                opacity: shieldPart3Opacity,
                transform: [
                  { translateX: shieldPart3X },
                  { translateY: shieldPart3Y },
                ],
              }}
            >
              <G clipPath="url(#SVGID_5_)">
                <Rect x="140" y="21.5" width="47.8" height="77.9" fill="url(#SVGID_6_)" />
              </G>
            </AnimatedG>

            {/* Part 4: Light turquoise sweep stripe (right/bottom-right slide-in) */}
            <AnimatedG
              style={{
                opacity: shieldPart4Opacity,
                transform: [
                  { translateX: shieldPart4X },
                  { translateY: shieldPart4Y },
                ],
              }}
            >
              <Path
                fill="#62C2D1"
                d="M95.1,97.6c-1,0.8-2.4,1.8-2.8,0.5c0.1,1.9,0.5,3,1.3,4.2c2.2,3.4,7.3,7.8,11.4,10.7c2.4,1.7,3.7,1.2,4.9,0.1c25.6-22.3,59.6-41.2,88.8-45.5c21.7-3.2,23.5,16.1,23.2,22.9c1.7-7.1,3.2-29.4-10.1-37.3c-4.3-2.5-10.3-4.1-17.9-4.1C173.2,49.1,140.1,61,95.1,97.6z"
              />
            </AnimatedG>

            {/* Part 5: Left bottom sweep stripe (bottom-left slide-in) */}
            <AnimatedG
              style={{
                opacity: shieldPart5Opacity,
                transform: [
                  { translateX: shieldPart5X },
                  { translateY: shieldPart5Y },
                ],
              }}
            >
              <G clipPath="url(#SVGID_8_)">
                <Rect x="54.9" y="49.1" width="132.9" height="65.5" fill="url(#SVGID_9_)" />
              </G>
            </AnimatedG>
          </G>

          {/* Animated Letter G groups for B-R-A-I-N-S */}
          {/* B */}
          <AnimatedG
            style={{
              opacity: bOpacity,
              transform: [{ translateY: bY }],
            }}
          >
            <Path
              fill="#134E95"
              d="M41.5,198.1v-0.4c10.9-1.1,16.2-6.8,16.2-14.2c0-8-7.2-14.4-20.8-14.4H4.6v1.7l6.7,2.5v50.8l-6.7,2.4v1.8h35.1c11.2,0,21.4-5.3,21.4-15.7C61.2,207.3,57.6,198.7,41.5,198.1 M24.3,171.6h8.2c7.9,0,12.6,4.5,12.6,11.8c0,7.8-5.5,13.3-13.4,13.3c-3.8,0-7.4,0-7.4,0V171.6z M24.3,225.7v-26.2h8.5c9.8,0,14.5,5,14.5,12.7c0,8.4-5.3,13.5-14.6,13.5L24.3,225.7z"
            />
          </AnimatedG>

          {/* R */}
          <AnimatedG
            style={{
              opacity: rOpacity,
              transform: [{ translateY: rY }],
            }}
          >
            <Path
              fill="#134E95"
              d="M107.8,183.8c-1.5-0.5-3.8-1-7-1c-11.2,0-15.9,6.8-17.3,12h-0.3c0-1.5,0-10.7,0-10.7H64.1v1.8l6.7,2.5v35.8l-6.7,2.4v1.8h28.2v-1.7l-9-2.4v-18.1c0-6.4,2.4-12.8,5.3-16.2c3.2-3.7,8-5.3,11.7-4.7c-1.9,1.4-3.1,3.7-3.1,6.2c0,4.4,3.7,7.9,8.2,7.9c4.5,0,8.2-3.5,8.2-7.9C113.6,187.8,111.3,184.8,107.8,183.8"
            />
          </AnimatedG>

          {/* A */}
          <AnimatedG
            style={{
              opacity: aOpacity,
              transform: [{ translateY: aY }],
            }}
          >
            <Path
              fill="#134E95"
              d="M143.7,222c-0.6,0.7-1.8,2.5-3.8,2.5c-2.8,0-3.8-2.8-3.8-5l0-21.4c0-5-2.1-9.2-5.6-11.7c-3.5-2.6-8.8-3.7-14.4-3.7c-1.2,0-2.5,0.1-3.9,0.3c0.3,0.3,1.3,1,1.9,1.8c0.5,0,1-0.1,1.5-0.1c5.5,0,8.2,2.9,8.2,7.2v12.2c-2.7,0-10,0-13.2,0c-9.4,0-15.8,5.1-15.8,12.8c0,7.8,6.1,12.7,14,12.7c10.3,0,14.2-6,14.8-9.5h0.3c0.4,6.3,4.9,9.5,10.4,9.5c5.6,0,8.7-2.9,10.5-6.7C144.8,222.8,144.1,222.3,143.7,222 M123.7,213.1c0,6.1-4,10.3-9,10.3c-3.3,0-6.4-2.1-6.4-8.2c0-6.1,3.7-8.9,10.5-9.1c0.6,0,3.5-0.1,4.9-0.2V213.1z"
            />
          </AnimatedG>

          {/* I */}
          <AnimatedG
            style={{
              opacity: iOpacity,
              transform: [{ translateY: iY }],
            }}
          >
            <Polygon
              fill="#134E95"
              points="163.9,223.9 163.9,184.1 144.6,184.1 144.6,186 151.3,188.4 151.3,224.1 144.5,226.6 144.5,228.4 170.6,228.4 170.6,226.6"
            />
          </AnimatedG>

          {/* N */}
          <AnimatedG
            style={{
              opacity: nOpacity,
              transform: [{ translateY: nY }],
            }}
          >
            <Path
              fill="#134E95"
              d="M221.7,224.1v-26.5c0-7.9-4.3-14.6-14.4-14.6c-9.7,0-14.2,6.2-15.3,12h-0.4v-10.9h-19.2v1.7l6.7,2.6v35.8l-6.7,2.4v1.7h24.9v-1.7l-5.6-2.4v-20.7c0-5.9,3.1-13.4,9.7-13.4c6.4,0,7.7,4.5,7.7,9.5v24.6l-5.5,2.4v1.7h24.8v-1.8L221.7,224.1z"
            />
          </AnimatedG>

          {/* S */}
          <AnimatedG
            style={{
              opacity: sOpacity,
              transform: [{ translateY: sY }],
            }}
          >
            <Path
              fill="#134E95"
              d="M275.4,211.7c0,12-9.9,17.5-22.3,17.5c-5.7,0-11.6-1.2-16.7-3.9l-4.3,3h-1.8v-20.5h1.8l12.3,16c2.8,2.9,6.1,3.8,8.6,3.8c6.7,0,11.1-4.1,11.1-10.2c0-5-2.8-8.2-9.5-10.4l-10.8-3.5c-9.7-3.3-14.1-9.2-14.1-17.1c0-11.6,9.5-17.3,21.1-17.3c5.3,0,10.7,1.2,15.4,3.4l4.2-2.5h1.8v21.1h-1.8l-12.4-17.2c-1.3-1.9-4.1-3.2-6.7-3.2c-6.8,0-10.3,5.4-10.3,10.9c0,5.2,2.9,7.9,10,10.4l10.4,3.5C271.3,198.7,275.4,204,275.4,211.7"
            />
          </AnimatedG>
        </Svg>
      </View>


    </AnimatedView>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  logoWrapper: {
    width: 280,
    height: 238,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#11B6CB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 15,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  svgLogo: {
    width: '100%',
    height: '100%',
  },

});
